#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { fetchTemplateAndViews } from "../fetchTemplateMetadata.js";
import { filterViewContent } from "../filterViewContent.js";

interface CliOptions {
  baseUrl?: string;
  include: string[];
  exclude: string[];
  output: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    include: [],
    exclude: [],
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
      case "--exclude":
      case "-e":
        options.exclude.push(...readList(argv[++i]));
        break;
      case "--output":
      case "-o":
        options.output = argv[++i] ?? options.output;
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

function printUsage() {
  const message = `Usage: npx document-template-customizer --base-url <url> [options]\n\n` +
    `Options:\n` +
    `  -b, --base-url   Required. URL of the base template repository.\n` +
    `  -i, --include    Comma-separated labels to include (sections matching any are kept).\n` +
    `  -e, --exclude    Comma-separated labels to exclude (matching sections removed).\n` +
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

    const zip = new JSZip();
    let includedViews = 0;

    for (const view of result.views) {
      if (!view.content) continue;
      const filtered = filterViewContent(view.content, {
        includeLabels: options.include,
        excludeLabels: options.exclude,
      });

      if (!filtered.content.trim()) {
        continue;
      }

      zip.file(view.file, filtered.content);
      includedViews += 1;
    }

    if (includedViews === 0) {
      throw new Error("No views left after applying label filters.");
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const targetPath = path.resolve(process.cwd(), options.output);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);

    console.log(`Generated ${targetPath} with ${includedViews} view(s).`);
  } catch (error: any) {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  }
}

run();
