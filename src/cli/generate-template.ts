#!/usr/bin/env node
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { fetchTemplateAndParts } from "../fetchTemplateMetadata.js";
import { filterPartContent } from "../filterPartContent.js";
import type { TemplateLabelDefinition, TemplateWithParts } from "../model/index.js";

interface CliOptions {
  baseUrl?: string;
  include: string[];
  output: string;
  outputFile?: string;
  includeAnchors: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    include: [],
    output: "custom-template.zip",
    includeAnchors: true,
  };

  const readList = (value: string | undefined) =>
    (value ?? "")
      .split(",")
      .map(entry => entry.trim())
      .filter(Boolean);

  const readValue = (arg: string, next: () => string | undefined) => {
    const eqIndex = arg.indexOf("=");
    if (eqIndex !== -1) {
      return arg.slice(eqIndex + 1) || undefined;
    }
    return next();
  };

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index++];
    const nextValue = () => argv[index++];

    if (arg === "--base-url" || arg === "-b") {
      options.baseUrl = readValue(arg, nextValue);
    } else if (arg.startsWith("--base-url=")) {
      options.baseUrl = readValue(arg, () => undefined);
    } else if (arg === "--include" || arg === "-i") {
      options.include.push(...readList(readValue(arg, nextValue)));
    } else if (arg.startsWith("--include=")) {
      options.include.push(...readList(readValue(arg, () => undefined)));
    } else if (arg === "--output" || arg === "-o") {
      options.output = readValue(arg, nextValue) ?? options.output;
    } else if (arg.startsWith("--output=")) {
      options.output = readValue(arg, () => undefined) ?? options.output;
    } else if (arg === "--output-file") {
      options.outputFile = readValue(arg, nextValue);
    } else if (arg.startsWith("--output-file=")) {
      options.outputFile = readValue(arg, () => undefined);
    } else if (arg === "--no-anchors") {
      options.includeAnchors = false;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      if (arg.startsWith("-")) {
        throw new Error(`Unknown option: ${arg}`);
      }
      options.baseUrl ??= arg;
    }
  }

  return options;
}

export function findUnknownLabels(
  requested: string[],
  definitions: TemplateLabelDefinition[] | undefined,
  parts: TemplateWithParts["parts"]
): string[] {
  if (!requested.length) return [];

  const known = new Set<string>();

  if (definitions?.length) {
    for (const def of definitions) {
      known.add(def.name);
      if (def.available_values?.length) {
        for (const value of def.available_values) {
          known.add(`${def.name}::${value}`);
        }
      }
    }
  }

  const visit = (
    section: NonNullable<TemplateWithParts["parts"][number]["sections"]>[number]
  ) => {
    section.metadata?.labels?.forEach(label => known.add(label));
    section.children.forEach(child => visit(child));
  };

  for (const part of parts) {
    part.sections?.forEach(section => visit(section));
  }

  if (!known.size) return requested.slice();

  return requested.filter(label => !known.has(label));
}

function printUsage() {
  const message = `Usage: npx document-template-customizer --base-url <url> [options]\n\n` +
    `Options:\n` +
    `  -b, --base-url   Required. URL of the base template repository.\n` +
    `  -i, --include    Comma-separated labels to include (sections matching any are kept).\n` +
    `      --no-anchors Do not insert AsciiDoc block IDs [#id] in outputs.\n` +
    `  -o, --output     Output zip path (default: custom-template.zip).\n` +
    `  -h, --help       Show this help message.\n`;
  console.log(message);
}

async function run() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.baseUrl) {
      printUsage();
      throw new Error("Missing required --base-url argument.");
    }

    const fetchImpl = createFetch(options.baseUrl);
    const result = await fetchTemplateAndParts(options.baseUrl, {
      strict: false,
      fetchImpl,
    });

    const knownLabels = collectKnownLabels(result);
    const unknownLabels = options.include.filter(label => !knownLabels.has(label));
    if (unknownLabels.length) {
      throw new Error(`Unknown label(s): ${unknownLabels.join(", ")}`);
    }

    const wildcardDefaults = Array.from(knownLabels).filter(label => label.endsWith('::*'));
    const effectiveInclude = Array.from(new Set([...options.include, ...wildcardDefaults]));

    const zip = new JSZip();
    let includedParts = 0;

    // Build cross-part xref index: id -> { title, file }
    const linkIndex: Record<string, { title: string; file: string }> = {};
    const visit = (
      section: NonNullable<TemplateWithParts["parts"][number]["sections"]>[number],
      file: string,
    ) => {
      const id = section.metadata?.id?.trim();
      if (id) linkIndex[id] = { title: section.title, file };
      section.children.forEach(child => visit(child, file));
    };
    result.parts.forEach(part => part.sections?.forEach(sec => visit(sec, part.file)));

    for (const part of result.parts) {
      if (!part.content) continue;
      const filtered = filterPartContent(part.content, {
        includeLabels: effectiveInclude,
        includeAnchors: options.includeAnchors,
        linkIndex,
        currentFile: part.file,
      });

      const hasTemplate = filtered.templateContent.trim().length > 0;
      const hasBlank = filtered.blankContent.trim().length > 0;
      if (!hasTemplate && !hasBlank) {
        continue;
      }

      if (hasTemplate) {
        zip.file(`template/${part.file}`, filtered.templateContent);
      }
      if (hasBlank) {
        zip.file(`blank-template/${part.file}`, filtered.blankContent);
      }
      includedParts += 1;
    }

    if (result.readme?.content) {
      zip.file(`template/${result.readme.file}`, result.readme.content);
    }

    if (includedParts === 0) {
      throw new Error("No parts left after applying label filters.");
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const targetPath = options.outputFile
      ? path.resolve(options.outputFile)
      : path.resolve(process.cwd(), options.output);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);

    console.log(`Generated ${targetPath} with ${includedParts} part(s).`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

const isMainModule = (() => {
  if (typeof process === "undefined") return false;
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === path.resolve(entry);
})();

if (isMainModule) {
  void run();
}

function createFetch(baseUrl: string): typeof fetch {
  const isFile = baseUrl.startsWith("file://");
  if (!isFile) return fetch;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    if (!target.startsWith("file://")) {
      return fetch(input, init);
    }

    const filePath = fileURLToPath(target);
    const data = await readFile(filePath);
    return new Response(data);
  };
}

function collectKnownLabels(template: TemplateWithParts): Set<string> {
  const known = new Set<string>();

  template.metadata.data.labels?.forEach(def => {
    known.add(def.name);
    def.available_values?.forEach(value => known.add(`${def.name}::${value}`));
  });

  const visit = (
    section: NonNullable<TemplateWithParts["parts"][number]["sections"]>[number]
  ) => {
    section.metadata?.labels?.forEach(label => known.add(label));
    section.children.forEach(child => visit(child));
  };

  template.parts.forEach(part => part.sections?.forEach(section => visit(section)));

  return known;
}
