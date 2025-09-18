import type { PartSection, PartSectionMetadata } from "./model/index.js";

export interface PartSectionWithLocation extends PartSection {
  startLine: number;
  endLine: number;
}

const HEADING_REGEX = /^\s*(#{1,6})\s+(.*)$/;
// Matches metadata marker above a heading:
// - AsciiDoc comment: `//🏷{...}`
// - Markdown HTML comment: `<!--🏷{...}-->`
const METADATA_REGEX = /^(?:\s*\/\/\s*🏷\s*(\{.*\})\s*$|\s*<!--\s*🏷\s*(\{.*\})\s*-->\s*$)/;

export function parseAsciiDocSections(content: string): PartSection[] {
  const lines = content.split(/\r?\n/);
  const roots: PartSectionWithLocation[] = [];
  const stack: PartSectionWithLocation[] = [];
  let pendingMetadata: PartSectionMetadata | undefined;
  let pendingMetadataLine: number | undefined;

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const metadataMatch = METADATA_REGEX.exec(trimmed);
    if (metadataMatch) {
      const json = metadataMatch[1] ?? metadataMatch[2];
      const parsed = parseMetadata(json!);
      if (parsed) pendingMetadata = parsed;
      pendingMetadataLine = index;
      continue;
    }

    const match = HEADING_REGEX.exec(line);
    if (!match) {
      if (trimmed) pendingMetadata = undefined;
      if (trimmed) pendingMetadataLine = undefined;
      continue;
    }

    const [, hashes, titleRaw] = match;
    const level = hashes.length;
    const title = titleRaw.trim();
    if (!title) continue;

    const nodeStartLine = pendingMetadataLine ?? index;

    while (stack.length && stack[stack.length - 1].level >= level) {
      const popped = stack.pop()!;
      popped.endLine = Math.max(popped.startLine, nodeStartLine - 1);
    }

    const node: PartSectionWithLocation = {
      level,
      title,
      children: [],
      metadata: pendingMetadata,
      startLine: nodeStartLine,
      endLine: lines.length - 1,
    };

    pendingMetadata = undefined;
    pendingMetadataLine = undefined;

    if (!stack.length) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  const lastLineIndex = Math.max(0, lines.length - 1);
  while (stack.length) {
    const node = stack.pop()!;
    if (node.endLine < node.startLine) {
      node.endLine = node.startLine;
    }
    if (lastLineIndex > node.endLine) {
      node.endLine = lastLineIndex;
    }
  }

  return roots;
}

function parseMetadata(value: string): PartSectionMetadata | undefined {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return undefined;
    const metadata: PartSectionMetadata = { raw: parsed as Record<string, unknown> };

    if (typeof (parsed as any).id === "string") {
      metadata.id = (parsed as any).id;
    }
    if (Array.isArray((parsed as any).labels)) {
      const labels = (parsed as any).labels.filter((label: unknown): label is string => typeof label === "string");
      if (labels.length) metadata.labels = labels;
    }
    const linkValues: string[] = [];
    const rawLink = (parsed as any).link_to ?? (parsed as any).links;
    if (typeof rawLink === "string") {
      linkValues.push(rawLink);
    } else if (Array.isArray(rawLink)) {
      for (const entry of rawLink) {
        if (typeof entry === "string") linkValues.push(entry);
      }
    }
    if (linkValues.length) metadata.linkTo = linkValues;

    return metadata;
  } catch (error) {
    return undefined;
  }
}
