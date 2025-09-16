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

  const keptStartLines = new Set<number>();
  collectStartLines(filteredSections, keptStartLines);

  const dropMask = createDropMask(lines.length, sections, keptStartLines);

  const templateLines: string[] = [];
  const blankLines: string[] = [];
  const hadTrailingNewline = rawContent.endsWith("\n") || rawContent.endsWith("\r\n");

  for (let i = 0; i < lines.length; i++) {
    if (dropMask[i]) continue;
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

  return {
    templateContent,
    blankContent,
    keptSections: keptStartLines.size,
  };
}

function collectStartLines(sections: SectionNode[], target: Set<number>) {
  for (const section of sections) {
    target.add(section.startLine);
    if (section.children.length) {
      collectStartLines(section.children as SectionNode[], target);
    }
  }
}

function createDropMask(
  lineCount: number,
  originalSections: SectionNode[],
  keptStartLines: Set<number>
): boolean[] {
  const mask = new Array<boolean>(lineCount).fill(false);

  const markRange = (start: number, end: number) => {
    const upper = Math.min(end, lineCount - 1);
    for (let index = Math.max(0, start); index <= upper; index++) {
      mask[index] = true;
    }
  };

  const visit = (sections: SectionNode[]) => {
    for (const section of sections) {
      if (!keptStartLines.has(section.startLine)) {
        markRange(section.startLine, section.endLine);
        continue;
      }
      if (section.children.length) {
        visit(section.children as SectionNode[]);
      }
    }
  };

  visit(originalSections);
  return mask;
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
