/* eslint-disable @typescript-eslint/no-explicit-any */
import { parse } from "yaml";
import {
  TemplateMetadataNotFoundError,
  PartFetchError,
  type TemplateFetchResult,
  type TemplateMetadata,
  type TemplateWithParts,
  type Part,
  type PartFetchFailure,
  type TemplateLabelDefinition,
} from "./model/index.js";
import { parseAsciiDocSections } from "./parseAsciiDocSections.js";

/* ================== Core ================== */

type FetchLike = typeof fetch;

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: ac.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTemplateMetadata(
  baseUrl: string,
  opts?: { timeoutMs?: number; fetchImpl?: FetchLike }
): Promise<TemplateFetchResult> {
  const fetchFn = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 15_000;

  const normalized = baseUrl.replace(/\/+$/, "");
  const target = `${normalized}/base-template-metadata.yaml`;

  try {
    const res = await fetchWithTimeout(fetchFn, target, timeoutMs);
    if (!res.ok) throw new TemplateMetadataNotFoundError(target, res.status);

    const raw = await res.text();
    if (!raw.trim()) throw new Error(`Empty base-template-metadata.yaml at ${target}.`);

    let parsed: any;
    try {
      parsed = parse(raw);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      throw new Error(`YAML parse error: ${msg}`);
    }

    const labelDefs = Array.isArray(parsed.labels)
      ? parsed.labels
          .map((label: any): TemplateLabelDefinition | null => {
            // Support both forms:
            // - { name: "level", available_values: ["basic", ...] }
            // - { level: ["basic", ...] }
            let name: string | undefined;
            let values: string[] | undefined;

            if (label && typeof label === "object") {
              if (typeof label.name === "string") {
                name = label.name.trim();
                if (Array.isArray(label.available_values)) {
                  values = label.available_values
                    .filter((v: unknown): v is string => typeof v === "string")
                    .map((v: string) => v.trim())
                    .filter(Boolean);
                }
              } else {
                const keys = Object.keys(label);
                if (keys.length === 1) {
                  const k = keys[0];
                  const rawVals = (label as any)[k];
                  if (Array.isArray(rawVals)) {
                    name = String(k).trim();
                    values = rawVals
                      .filter((v: unknown): v is string => typeof v === "string")
                      .map((v: string) => v.trim())
                      .filter(Boolean);
                  }
                }
              }
            }

            if (!name) return null;
            if (values && values.length) return { name, available_values: values };
            return { name };
          })
          .filter((label: TemplateLabelDefinition | null): label is TemplateLabelDefinition => label !== null)
      : undefined;

    const data: TemplateMetadata = {
      author: parsed.author,
      license: parsed.license,
      parts: Array.isArray(parsed.parts) ? parsed.parts : [],
      labels: labelDefs,
    };

    return { url: target, raw, data };
  } catch (err: any) {
    if (err instanceof TemplateMetadataNotFoundError) throw err;
    if (err?.name === "AbortError") {
      throw new Error(`Timed out fetching base-template-metadata.yaml from ${target} after ${timeoutMs} ms.`);
    }
    throw new Error(`Failed to fetch ${target}: ${err?.message ?? String(err)}`);
  }
}

/**
 * Fetch metadata, then try to fetch *all* .adoc parts at <baseUrl>/<file>.
 * If any part fetch fails and `strict` is true (default), throws PartFetchError listing all failures.
 * If `strict` is false, returns what succeeded; failed parts are omitted.
 */
export async function fetchTemplateAndParts(
  baseUrl: string,
  opts?: {
    timeoutMs?: number;
    fetchImpl?: FetchLike;
    strict?: boolean;      // default true: throw if any part fails
    concurrency?: number;  // default 6
  }
): Promise<TemplateWithParts> {
  const fetchFn = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const strict = opts?.strict ?? true;
  const concurrency = Math.max(1, opts?.concurrency ?? 6);

  const metadata = await fetchTemplateMetadata(baseUrl, { timeoutMs, fetchImpl: fetchFn });

  const normalized = baseUrl.replace(/\/+$/, "");
  const toFetch = metadata.data.parts.map(part => ({
    name: part.name,
    file: part.file,
    url: `${normalized}/${part.file.replace(/^\/+/, "")}`,
  }));

  const readme = await fetchReadme(normalized, fetchFn, timeoutMs);

  // Simple concurrency limiter
  const results: Array<{ ok: true; part: Required<Part> } | { ok: false; failure: PartFetchFailure }> = [];
  let index = 0;

  async function worker() {
    while (index < toFetch.length) {
      const i = index++;
      const item = toFetch[i];
      try {
        const res = await fetchWithTimeout(fetchFn, item.url, timeoutMs);
        if (!res.ok) {
          results.push({
            ok: false,
            failure: {
              name: item.name,
              file: item.file,
              url: item.url,
              status: res.status,
              message: `HTTP ${res.status}`,
            },
          });
          continue;
        }
        const content = await res.text();
        results.push({
          ok: true,
          part: {
            name: item.name,
            file: item.file,
            url: item.url,
            content,
            sections: parseAsciiDocSections(content),
          },
        });
      } catch (e: any) {
        const message =
          e?.name === "AbortError"
            ? `Timed out after ${timeoutMs} ms`
            : (e?.message ?? String(e));
        results.push({
          ok: false,
          failure: { name: item.name, file: item.file, url: item.url, message },
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, toFetch.length) }, () => worker());
  await Promise.all(workers);

  const failures = results
    .filter(r => !r.ok)
    .map(r => (r as { ok: false; failure: PartFetchFailure }).failure);
  const successes = results
    .filter((r): r is { ok: true; part: Required<Part> } => r.ok)
    .map(r => r.part);

  if (failures.length && strict) {
    throw new PartFetchError(failures);
  }

  // Validate uniqueness of section ids across the whole base template
  const dupErrors = findDuplicateSectionIds(successes);
  if (dupErrors.length) {
    const details = dupErrors
      .map(d => `id '${d.id}' used in ${d.locations.map(l => `${l.file} -> ${l.title}`).join("; ")}`)
      .join(" | ");
    throw new Error(`Duplicate section id(s) detected: ${details}`);
  }

  return {
    metadata,
    parts: successes,
    readme,
  };
}

export {
  TemplateMetadataNotFoundError,
  PartFetchError,
} from "./model/index.js";

export type {
  TemplateFetchResult,
  TemplateMetadata,
  TemplateWithParts,
  Part,
  PartFetchFailure,
} from "./model/index.js";

const README_CANDIDATES = [
  "README.adoc",
  "Readme.adoc",
  "readme.adoc",
  "ReadMe.adoc"  
];

async function fetchReadme(
  baseUrl: string,
  fetchFn: FetchLike,
  timeoutMs: number
): Promise<{ file: string; content: string }> {
  for (const candidate of README_CANDIDATES) {
    const target = `${baseUrl}/${candidate}`;
    try {
      const res = await fetchWithTimeout(fetchFn, target, timeoutMs);
      if (!res.ok) continue;
      const content = await res.text();
      if (!content.trim()) continue;
      return { file: candidate, content };
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        continue;
      }
    }
  }

  throw new Error(
    `README (adoc/md) is required in the base template. Tried: ${README_CANDIDATES.join(", ")}`
  );
}

function findDuplicateSectionIds(parts: Required<Part>[]): Array<{
  id: string;
  locations: Array<{ file: string; title: string }>;
}> {
  const map = new Map<string, Array<{ file: string; title: string }>>();

  const visit = (file: string, section: NonNullable<Required<Part>["sections"]>[number]) => {
    const id = section.metadata?.id?.trim();
    if (id) {
      const arr = map.get(id) ?? [];
      arr.push({ file, title: section.title });
      map.set(id, arr);
    }
    section.children.forEach(child => visit(file, child));
  };

  for (const part of parts) {
    part.sections?.forEach(sec => visit(part.file, sec));
  }

  const dups: Array<{ id: string; locations: Array<{ file: string; title: string }> }> = [];
  for (const [id, locations] of map.entries()) {
    if (locations.length > 1) dups.push({ id, locations });
  }
  return dups;
}
