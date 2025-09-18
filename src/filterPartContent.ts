import { parseAsciiDocSections, type PartSectionWithLocation } from "./parseAsciiDocSections.js";

const HEADING_REGEX = /^\s*#{1,6}\s+.+$/;
const ATTRIBUTE_REGEX = /^\s*:[^:]+:.*$/;
const METADATA_REGEX = /^\s*🏷\s*(\{.*\})\s*$/;

export interface FilterPartContentOptions {
  includeLabels?: string[];
  wildcard?: boolean;
}

function normalizeLabels(labels?: string[]): string[] {
  return (labels ?? []).map(label => label.trim()).filter(Boolean);
}

type SectionNode = PartSectionWithLocation & { children: SectionNode[] };

type SectionDecision = {
  node: SectionNode;
  matches: boolean;
  keep: boolean;
  children: SectionDecision[];
};

export interface FilterPartContentResult {
  templateContent: string;
  blankContent: string;
  keptSections: number;
}

export function filterPartContent(
  rawContent: string,
  options: FilterPartContentOptions = {}
): FilterPartContentResult {
  const includeLabels = normalizeLabels(options.includeLabels);
  const wildcard = options.wildcard ?? true;
  const lines = rawContent.split(/\r?\n/);

  const sections = parseAsciiDocSections(rawContent) as SectionNode[];

  let filteredSections: SectionNode[] = sections;
  let keepMask: boolean[];

  if (includeLabels.length) {
    const decisions = buildSectionDecisions(sections, includeLabels, wildcard);
    filteredSections = collectMatchedSections(decisions);
    keepMask = createKeepMask(lines.length, decisions);
  } else {
    keepMask = new Array<boolean>(lines.length).fill(true);
  }

  const templateLines: string[] = [];
  const blankLines: string[] = [];
  const hadTrailingNewline = rawContent.endsWith("\n") || rawContent.endsWith("\r\n");

  for (let i = 0; i < lines.length; i++) {
    if (!keepMask[i]) continue;
    const line = lines[i];
    const trimmed = line.trim();
    if (METADATA_REGEX.test(trimmed)) continue;
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

function createKeepMask(lineCount: number, decisions: SectionDecision[]): boolean[] {
  if (lineCount === 0) return [];

  const mask = new Array<boolean>(lineCount).fill(false);

  const clampLine = (value: number) => Math.min(Math.max(value, 0), lineCount - 1);
  const markRange = (start: number, end: number) => {
    if (start > end) return;
    for (let index = start; index <= end; index++) {
      mask[index] = true;
    }
  };

  const process = (decision: SectionDecision) => {
    if (!decision.keep) return;

    if (!decision.matches) {
      decision.children.forEach(process);
      return;
    }

    const section = decision.node;
    const sectionStart = clampLine(section.startLine);
    const sectionEnd = clampLine(section.endLine);
    if (sectionStart > sectionEnd) return;

    const sortedChildren = [...decision.children].sort(
      (a, b) => a.node.startLine - b.node.startLine
    );

    let cursor = sectionStart;

    for (const child of sortedChildren) {
      const childStart = clampLine(child.node.startLine);
      const childEnd = clampLine(child.node.endLine);

      if (childStart > sectionEnd) break;

      if (childStart > cursor) {
        markRange(cursor, Math.min(childStart - 1, sectionEnd));
      }

      if (child.keep) {
        process(child);
      }

      cursor = Math.max(cursor, childEnd + 1);
      if (cursor > sectionEnd) break;
    }

    if (cursor <= sectionEnd) {
      markRange(cursor, sectionEnd);
    }
  };

  decisions.forEach(process);
  return mask;
}

function countSections(sections: SectionNode[]): number {
  let total = 0;
  for (const section of sections) {
    total += 1 + countSections(section.children as SectionNode[]);
  }
  return total;
}

function buildSectionDecisions(
  sections: SectionNode[],
  labels: string[],
  wildcard: boolean
): SectionDecision[] {
  const candidateSet = new Set(labels);

  const evaluate = (section: SectionNode): SectionDecision => {
    const matches = matchesAnyLabel(section.metadata?.labels, candidateSet, wildcard);
    const children = section.children.map(evaluate);
    const keep = matches || children.some(child => child.keep);
    return {
      node: section,
      matches,
      keep,
      children,
    };
  };

  return sections.map(evaluate);
}

function collectMatchedSections(decisions: SectionDecision[]): SectionNode[] {
  const result: SectionNode[] = [];
  for (const decision of decisions) {
    if (!decision.keep) continue;
    const keptChildren = collectMatchedSections(decision.children);
    if (decision.matches) {
      result.push({ ...decision.node, children: keptChildren });
    } else {
      result.push(...keptChildren);
    }
  }
  return result;
}

function matchesAnyLabel(
  labels: string[] | undefined,
  candidates: Set<string>,
  wildcard: boolean
): boolean {
  if (!labels?.length) return false;
  if (!wildcard) {
    return labels.some(label => candidates.has(label));
  }

  // Wildcard matching in both directions within the same namespace
  return labels.some(label => {
    const trimmed = label.trim();
    if (!trimmed) return false;
    if (candidates.has(trimmed)) return true;

    const [ns = "", val = ""] = trimmed.split("::", 2);
    if (!ns) return false;

    // Candidate wildcard matches concrete label
    if (val && candidates.has(`${ns}::*`)) return true;

    // Label wildcard matches concrete candidate value
    if (val === "*") {
      for (const cand of candidates) {
        if (cand.startsWith(`${ns}::`)) return true;
      }
    }

    return false;
  });
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
