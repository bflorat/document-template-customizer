import { parse } from "yaml";

/* ================== Types ================== */

export interface View {
  name: string;
  file: string;
  url?: string;       // resolved URL for this view
  content?: string;   // fetched .adoc content
}

export interface TemplateMetadata {
  author: string;
  license: string;
  views: View[];
}

export interface TemplateFetchResult {
  url: string;             // metadata URL
  raw: string;             // raw YAML
  data: TemplateMetadata;  // parsed metadata
}

export interface TemplateWithViews {
  metadata: TemplateFetchResult;
  views: Required<Pick<View, "name" | "file" | "url" | "content">>[];
}

export class TemplateMetadataNotFoundError extends Error {
  public readonly attemptedUrl: string;
  public readonly status?: number;

  constructor(attemptedUrl: string, status?: number) {
    super(
      status
        ? `template-metadata.yaml not found at ${attemptedUrl} (HTTP ${status}).`
        : `template-metadata.yaml not found at ${attemptedUrl}.`
    );
    this.name = "TemplateMetadataNotFoundError";
    this.attemptedUrl = attemptedUrl;
    this.status = status;
  }
}

export class ViewFetchError extends Error {
  public readonly failures: Array<{
    name: string;
    file: string;
    url: string;
    status?: number;
    message: string;
  }>;

  constructor(failures: ViewFetchError["failures"]) {
    super(
      `Failed to fetch ${failures.length} view file(s): ` +
        failures.map(f => `${f.name} (${f.file}) [${f.status ?? "?"}]`).join(", ")
    );
    this.name = "ViewFetchError";
    this.failures = failures;
  }
}

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
  const target = `${normalized}/template-metadata.yaml`;

  try {
    const res = await fetchWithTimeout(fetchFn, target, timeoutMs);
    if (!res.ok) throw new TemplateMetadataNotFoundError(target, res.status);

    const raw = await res.text();
    if (!raw.trim()) throw new Error(`Empty template-metadata.yaml at ${target}.`);

    let parsed: any;
    try {
      parsed = parse(raw);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      throw new Error(`YAML parse error: ${msg}`);
    }

    const data: TemplateMetadata = {
      author: parsed.author,
      license: parsed.license,
      views: Array.isArray(parsed.views) ? parsed.views : [],
    };

    return { url: target, raw, data };
  } catch (err: any) {
    if (err instanceof TemplateMetadataNotFoundError) throw err;
    if (err?.name === "AbortError") {
      throw new Error(`Timed out fetching template-metadata.yaml from ${target} after ${timeoutMs} ms.`);
    }
    throw new Error(`Failed to fetch ${target}: ${err?.message ?? String(err)}`);
  }
}

/**
 * Fetch metadata, then try to fetch *all* .adoc views at <baseUrl>/<file>.
 * If any view fetch fails and `strict` is true (default), throws ViewFetchError listing all failures.
 * If `strict` is false, returns what succeeded; failed views are omitted.
 */
export async function fetchTemplateAndViews(
  baseUrl: string,
  opts?: {
    timeoutMs?: number;
    fetchImpl?: FetchLike;
    strict?: boolean;      // default true: throw if any view fails
    concurrency?: number;  // default 6
  }
): Promise<TemplateWithViews> {
  const fetchFn = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const strict = opts?.strict ?? true;
  const concurrency = Math.max(1, opts?.concurrency ?? 6);

  const metadata = await fetchTemplateMetadata(baseUrl, { timeoutMs, fetchImpl: fetchFn });

  const normalized = baseUrl.replace(/\/+$/, "");
  const toFetch = metadata.data.views.map(v => ({
    name: v.name,
    file: v.file,
    url: `${normalized}/${v.file.replace(/^\/+/, "")}`,
  }));

  // Simple concurrency limiter
  const results: Array<{ ok: true; view: Required<View> } | { ok: false; failure: ViewFetchError["failures"][number] }> = [];
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
          view: { name: item.name, file: item.file, url: item.url, content },
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

  const failures = results.filter(r => !r.ok).map(r => (r as any).failure) as ViewFetchError["failures"];
  const successes = results.filter(r => r.ok).map(r => (r as any).view) as Required<View>[];

  if (failures.length && strict) {
    throw new ViewFetchError(failures);
  }

  return {
    metadata,
    views: successes,
  };
}