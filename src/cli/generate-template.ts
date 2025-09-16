#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { fetchTemplateAndViews } from "../fetchTemplateMetadata.js";
import { filterViewContent } from "../filterViewContent.js";
import type { TemplateLabelDefinition, TemplateWithViews } from "../model/index.js";

interface CliOptions {
  baseUrl?: string;
  include: string[];
  output: string;
  outputFile?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    include: [],
    output: "custom-template.zip",
  };

  const readList = (value: string | undefined) =>
    (value ?? "")
      .split(",")
      .map(entry => entry.trim())
      .filter(Boolean);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--base-url":
      case "-b":
        options.baseUrl = argv[++i];
        break;
      case "--include":
      case "-i":
        options.include.push(...readList(argv[++i]));
        break;
      case "--output":
      case "-o":
        options.output = argv[++i] ?? options.output;
        break;
      case "--output-file":
        options.outputFile = argv[++i];
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        // Positional base URL support
        options.baseUrl ??= arg;
        break;
    }
  }

  return options;
}

export function findUnknownLabels(
  requested: string[],
  definitions: TemplateLabelDefinition[] | undefined,
  views: TemplateWithViews["views"]
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
    section: NonNullable<TemplateWithViews["views"][number]["sections"]>[number]
  ) => {
    section.metadata?.labels?.forEach(label => known.add(label));
    section.children.forEach(child => visit(child));
  };

  for (const view of views) {
    view.sections?.forEach(section => visit(section));
  }

  if (!known.size) return requested.slice();

  return requested.filter(label => !known.has(label));
}

function printUsage() {
  const message = `Usage: npx document-template-customizer --base-url <url> [options]\n\n` +
    `Options:\n` +
    `  -b, --base-url   Required. URL of the base template repository.\n` +
    `  -i, --include    Comma-separated labels to include (sections matching any are kept).\n` +
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

    const result = await fetchTemplateAndViews(options.baseUrl, {
      strict: false,
    });

    const unknownLabels = findUnknownLabels(options.include, result.metadata.data.labels, result.views);
    if (unknownLabels.length) {
      throw new Error(`Unknown label(s): ${unknownLabels.join(", ")}`);
    }

    const zip = new JSZip();
    let includedViews = 0;

    for (const view of result.views) {
      if (!view.content) continue;
      const filtered = filterViewContent(view.content, {
        includeLabels: options.include,
      });

      const hasTemplate = filtered.templateContent.trim().length > 0;
      const hasBlank = filtered.blankContent.trim().length > 0;
      if (!hasTemplate && !hasBlank) {
        continue;
      }

      if (hasTemplate) {
        zip.file(`template/${view.file}`, filtered.templateContent);
      }
      if (hasBlank) {
        zip.file(`blank-template/${view.file}`, filtered.blankContent);
      }
      includedViews += 1;
    }

    if (includedViews === 0) {
      throw new Error("No views left after applying label filters.");
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const targetPath = options.outputFile
      ? path.resolve(options.outputFile)
      : path.resolve(process.cwd(), options.output);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);

    console.log(`Generated ${targetPath} with ${includedViews} view(s).`);
  } catch (error: any) {
    console.error(error?.message ?? String(error));
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
  run();
}
