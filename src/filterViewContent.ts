import { filterSectionsByLabels } from "./filterSectionsByLabels.js";
import { parseAsciiDocSections, type ViewSectionWithLocation } from "./parseAsciiDocSections.js";

const METADATA_REGEX = /^\s*🏷\s*(\{.*\})\s*$/;

export interface FilterViewContentOptions {
  includeLabels?: string[];
  excludeLabels?: string[];
}

function normalizeLabels(labels?: string[]): string[] {
  return (labels ?? []).map(label => label.trim()).filter(Boolean);
}

type SectionNode = ViewSectionWithLocation & { children: SectionNode[] };

export interface FilterViewContentResult {
  content: string;
  keptSections: number;
}

export function filterViewContent(
  rawContent: string,
  options: FilterViewContentOptions = {}
): FilterViewContentResult {
  const includeLabels = normalizeLabels(options.includeLabels);
  const excludeLabels = normalizeLabels(options.excludeLabels);
  const lines = rawContent.split(/\r?\n/);

  const sections = parseAsciiDocSections(rawContent) as SectionNode[];

  let filteredSections: SectionNode[] = sections;
  if (includeLabels.length) {
    filteredSections = filterSectionsByLabels(filteredSections, {
      labels: includeLabels,
      mode: "matching",
    }) as SectionNode[];
  }
  if (excludeLabels.length) {
    filteredSections = filterSectionsByLabels(filteredSections, {
      labels: excludeLabels,
      mode: "nonMatching",
    }) as SectionNode[];
  }

  const keptStartLines = new Set<number>();
  collectStartLines(filteredSections, keptStartLines);

  const dropMask = createDropMask(lines.length, sections, keptStartLines);

  const outputLines: string[] = [];
  const hadTrailingNewline = rawContent.endsWith("\n") || rawContent.endsWith("\r\n");

  for (let i = 0; i < lines.length; i++) {
    if (dropMask[i]) continue;
    if (METADATA_REGEX.test(lines[i].trim())) continue;
    outputLines.push(lines[i]);
  }

  removeTrailingEmptyLines(outputLines);

  let content = outputLines.join("\n");
  if (content && hadTrailingNewline) {
    content += "\n";
  }

  return {
    content,
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
