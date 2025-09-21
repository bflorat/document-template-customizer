import { parseAsciiDocSections, type PartSectionWithLocation } from "./parseAsciiDocSections.js";

// Support both Markdown-style ("#") and AsciiDoc-style ("=") headings
const HEADING_REGEX = /^\s*(?:#{1,6}|={1,6})\s+.+$/;
const ATTRIBUTE_REGEX = /^\s*:[^:]+:.*$/;
const ANCHOR_BLOCK_ID_REGEX = /^\s*\[#(?:[^\]]+)\]\s*$/;
// Metadata markers to strip: AsciiDoc `//🏷{...}`
const METADATA_REGEX = /^\s*\/\/\s*🏷\s*\{.*\}\s*$/;
const SEE_ALSO_REGEX = /^\s*TIP:\s+See also\b/;

export interface FilterPartContentOptions {
  includeLabels?: string[];
  dropTitles?: string[]; // section titles to drop (case-insensitive), level >= 2 only
  linkIndex?: Record<string, string | { title: string; file?: string }>; // id -> title or {title,file} map for See also
  includeAnchors?: boolean; // include AsciiDoc anchors [[id]] in outputs (default true)
  currentFile?: string; // current part file (for inter-document xrefs)
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
  const dropTitles = new Set((options.dropTitles ?? []).map(v => v.trim().toLowerCase()).filter(Boolean));
  const lines = rawContent.split(/\r?\n/);
  const includeAnchors = options.includeAnchors ?? true;

  const sections = parseAsciiDocSections(rawContent) as SectionNode[];

  let filteredSections: SectionNode[] = sections;
  let keepMask: boolean[];

  if (includeLabels.length) {
    const decisions = buildSectionDecisions(sections, includeLabels);
    filteredSections = collectMatchedSections(decisions);
    keepMask = createKeepMask(lines.length, decisions);
    // Always keep the first level-1 heading (e.g., "# Application")
    // even if no sections match, to avoid fully empty parts.
    const h1Index = findFirstLevelOneHeadingIndex(lines);
    if (h1Index !== -1) keepMask[h1Index] = true;
  } else {
    keepMask = new Array<boolean>(lines.length).fill(true);
  }

  // Apply explicit drop rules by title (case-insensitive), excluding level 1 sections
  if (dropTitles.size) {
    const dropByNode = (node: SectionNode) => {
      const shouldDrop = node.level >= 2 && dropTitles.has(node.title.trim().toLowerCase());
      if (shouldDrop) {
        const start = Math.max(0, node.startLine);
        const end = Math.min(lines.length - 1, node.endLine);
        for (let i = start; i <= end; i++) keepMask[i] = false;
      } else {
        node.children.forEach(child => dropByNode(child as SectionNode));
      }
    };
    (sections as SectionNode[]).forEach(dropByNode);
    // ensure H1 remains kept
    const h1Index = findFirstLevelOneHeadingIndex(lines);
    if (h1Index !== -1) keepMask[h1Index] = true;
  }

  const templateLines: string[] = [];
  const blankLines: string[] = [];
  const hadTrailingNewline = rawContent.endsWith("\n") || rawContent.endsWith("\r\n");

  // Precompute anchor and "See also" insertions by heading line index
  const insertions = buildInsertions(sections, lines, keepMask, options.linkIndex, options.currentFile);

  for (let i = 0; i < lines.length; i++) {
    if (!keepMask[i]) continue;
    const line = lines[i];
    const trimmed = line.trim();
    if (METADATA_REGEX.test(trimmed)) continue;
    if (HEADING_REGEX.test(trimmed)) {
      // Insert anchor (if any) before the heading line
      const anchor = insertions.anchors.get(i);
      if (anchor && includeAnchors) {
        templateLines.push(anchor);
        blankLines.push(anchor);
      }
      templateLines.push(line);
      blankLines.push(line);
      // Insert See also (if any) after heading
      const seeAlso = insertions.seeAlso.get(i);
      if (seeAlso) {
        templateLines.push(seeAlso);
        blankLines.push(seeAlso);
      }
    } else if (ATTRIBUTE_REGEX.test(trimmed)) {
      templateLines.push(line);
      blankLines.push(line);
    } else {
      templateLines.push(line);
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

function buildInsertions(
  sections: SectionNode[],
  lines: string[],
  keepMask: boolean[],
  linkIndex?: Record<string, string | { title: string; file?: string }>,
  currentFile?: string,
): { anchors: Map<number, string>; seeAlso: Map<number, string> } {
  const anchors = new Map<number, string>();
  const seeAlso = new Map<number, string>();
  const hasLinks = !!linkIndex && Object.keys(linkIndex).length > 0;

  const resolveHeadingLine = (node: SectionNode): number => {
    let idx = Math.max(0, node.startLine);
    const last = Math.min(lines.length - 1, node.endLine);
    // skip metadata comment if present
    while (idx <= last) {
      const t = lines[idx]?.trim() ?? '';
      if (METADATA_REGEX.test(t)) {
        idx += 1; // continue to next line (likely the heading)
        continue;
      }
      // first heading line encountered
      if (HEADING_REGEX.test(t)) return idx;
      // if any other non-empty content before heading, break to avoid infinite
      if (t) break;
      idx += 1;
    }
    return Math.max(0, node.startLine);
  };

  const visit = (node: SectionNode) => {
    const headingLine = resolveHeadingLine(node);
    if (keepMask[headingLine]) {
      const id = node.metadata?.id?.trim();
      if (id) {
        // AsciiDoc block ID anchor (more broadly supported by previewers)
        anchors.set(headingLine, `[#${id}]`);
      }
      if (hasLinks) {
        const links = node.metadata?.linkTo ?? [];
        if (links.length) {
          const refs: string[] = [];
          for (const linkId of links) {
            const entry = linkIndex![linkId];
            if (!entry) continue;
            if (typeof entry === 'string') {
              refs.push(`<<${linkId},${entry}>>`);
            } else {
              const title = entry.title;
              const file = entry.file;
              if (file && currentFile && file !== currentFile) {
                refs.push(`xref:${file}#${linkId}[${title}]`);
              } else {
                refs.push(`<<${linkId},${title}>>`);
              }
            }
          }
          if (refs.length) {
            seeAlso.set(headingLine, `TIP: See also ${refs.join(', ')}.`);
          }
        }
      }
    }
    node.children.forEach(child => visit(child as SectionNode));
  };

  sections.forEach(visit);
  return { anchors, seeAlso };
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

      process(child);

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

function findFirstLevelOneHeadingIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    // "# Heading" form
    if (trimmed.startsWith('#') && !trimmed.startsWith('##')) {
      if (/^#\s+/.test(trimmed)) return i;
    }
    // "= Heading" form
    if (trimmed.startsWith('=') && !trimmed.startsWith('==')) {
      if (/^=\s+/.test(trimmed)) return i;
    }
  }
  return -1;
}

function buildSectionDecisions(
  sections: SectionNode[],
  labels: string[],
): SectionDecision[] {
  const candidateSet = new Set(labels);

  const evaluate = (section: SectionNode): SectionDecision => {
    const labels = section.metadata?.labels ?? [];
    const hasLabels = labels.length > 0;
    const matches = hasLabels ? matchesAllLabels(labels, candidateSet) : false;
    const children = section.children.map(evaluate);
    // If labeled: keep only if matches.
    // If unlabeled: keep (it is not considered for matching) — it will still be dropped if an ancestor is dropped.
    const keep = hasLabels ? matches : true;
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
    result.push({ ...decision.node, children: keptChildren });
  }
  return result;
}

function matchesAllLabels(
  labels: string[] | undefined,
  candidates: Set<string>,
): boolean {
  if (!labels?.length) return false;

  const labelMatches = (label: string): boolean => {
    const trimmed = label.trim();
    if (!trimmed) return false;
    return candidates.has(trimmed);
  };

  // AND semantics: every section label must be satisfied
  return labels.every(labelMatches);
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
      // Do not separate from immediate See also line
      if (nextType === "heading" || nextType === "anchor") {
        result.push("");
      }
    } else if (currentType === "seeAlso") {
      // After See also paragraph, add a blank line to separate sections
      result.push("");
    } else if (currentType === "anchor") {
      // Never insert a blank line after an anchor block ID; it must be
      // immediately adjacent to the following heading to apply.
      // Do nothing here.
    } else if (lines[i].trim()) {
      result.push("");
    }
  }
  return result;
}

type LineType = "heading" | "attribute" | "anchor" | "seeAlso" | "other";

function classifyLine(line: string): LineType {
  const trimmed = line.trim();
  if (HEADING_REGEX.test(trimmed)) return "heading";
  if (ATTRIBUTE_REGEX.test(trimmed)) return "attribute";
  if (SEE_ALSO_REGEX.test(trimmed)) return "seeAlso";
  if (ANCHOR_BLOCK_ID_REGEX.test(trimmed)) return "anchor";
  return "other";
}
