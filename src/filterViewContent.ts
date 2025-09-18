import { filterSectionsByLabels } from "./filterSectionsByLabels.js";
import { parseAsciiDocSections, type ViewSectionWithLocation } from "./parseAsciiDocSections.js";

const HEADING_REGEX = /^\s*#{1,6}\s+.+$/;
const ATTRIBUTE_REGEX = /^\s*:[^:]+:.*$/;

export interface FilterViewContentOptions {
  includeLabels?: string[];
}

function normalizeLabels(labels?: string[]): string[] {
  return (labels ?? []).map(label => label.trim()).filter(Boolean);
}

type SectionNode = ViewSectionWithLocation & { children: SectionNode[] };

export interface FilterViewContentResult {
  templateContent: string;
  blankContent: string;
  keptSections: number;
}

export function filterViewContent(
  rawContent: string,
  options: FilterViewContentOptions = {}
): FilterViewContentResult {
  const includeLabels = normalizeLabels(options.includeLabels);
  const lines = rawContent.split(/\r?\n/);

  const sections = parseAsciiDocSections(rawContent) as SectionNode[];

  let filteredSections: SectionNode[] = sections;
  if (includeLabels.length) {
    filteredSections = filterSectionsByLabels(filteredSections, {
      labels: includeLabels,
    }) as SectionNode[];
  }

  const keepMask = createKeepMask(lines.length, filteredSections);

  const templateLines: string[] = [];
  const blankLines: string[] = [];
  const hadTrailingNewline = rawContent.endsWith("\n") || rawContent.endsWith("\r\n");

  for (let i = 0; i < lines.length; i++) {
    if (!keepMask[i]) continue;
    const line = lines[i];
    const trimmed = line.trim();
    templateLines.push(line);
    if (HEADING_REGEX.test(trimmed) || ATTRIBUTE_REGEX.test(trimmed)) {
      blankLines.push(line);
    }
  }

  removeTrailingEmptyLines(templateLines);
  removeTrailingEmptyLines(blankLines);

  const templateContent = finalizeContent(templateLines, hadTrailingNewline);
  const blankContent = finalizeContent(insertBlankLines(blankLines), hadTrailingNewline);
  const keptCount = countSections(filteredSections);

  return {
    templateContent,
    blankContent,
    keptSections: keptCount,
  };
}

function createKeepMask(lineCount: number, keptSections: SectionNode[]): boolean[] {
  const mask = new Array<boolean>(lineCount).fill(false);

  const markKeep = (section: SectionNode) => {
    const start = Math.max(0, section.startLine);
    const end = Math.min(lineCount - 1, section.endLine);
    for (let index = start; index <= end; index++) {
      mask[index] = true;
    }
    if (section.children.length) {
      section.children.forEach(child => markKeep(child as SectionNode));
    }
  };

  keptSections.forEach(markKeep);
  return mask;
}

function countSections(sections: SectionNode[]): number {
  let total = 0;
  for (const section of sections) {
    total += 1 + countSections(section.children as SectionNode[]);
  }
  return total;
}

function removeTrailingEmptyLines(lines: string[]) {
  let lastIndex = lines.length - 1;
  while (lastIndex >= 0 && !lines[lastIndex].trim()) {
    lines.pop();
    lastIndex--;
  }
}

function finalizeContent(lines: string[], hadTrailingNewline: boolean): string {
  if (lines.length === 0) return "";
  let content = lines.join("\n");
  if (hadTrailingNewline) {
    content += "\n";
  }
  return content;
}

function insertBlankLines(lines: string[]): string[] {
  if (lines.length === 0) return lines;
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    if (i === lines.length - 1) break;

    const currentType = classifyLine(lines[i]);
    const nextType = classifyLine(lines[i + 1]);

    if (currentType === "attribute") {
      if (nextType !== "attribute") {
        result.push("");
      }
    } else if (currentType === "heading") {
      if (nextType === "heading" || nextType === "other") {
        result.push("");
      }
    } else if (lines[i].trim()) {
      result.push("");
    }
  }
  return result;
}

type LineType = "heading" | "attribute" | "other";

function classifyLine(line: string): LineType {
  const trimmed = line.trim();
  if (HEADING_REGEX.test(trimmed)) return "heading";
  if (ATTRIBUTE_REGEX.test(trimmed)) return "attribute";
  return "other";
}
