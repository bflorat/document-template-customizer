import type { ViewSection, ViewSectionMetadata } from "./model/index.js";

export interface ViewSectionWithLocation extends ViewSection {
  startLine: number;
  endLine: number;
}

const HEADING_REGEX = /^\s*(#{1,6})\s+(.*)$/;
const METADATA_REGEX = /^\s*🏷\s*(\{.*\})\s*$/;

export function parseAsciiDocSections(content: string): ViewSection[] {
  const lines = content.split(/\r?\n/);
  const roots: ViewSectionWithLocation[] = [];
  const stack: ViewSectionWithLocation[] = [];
  let pendingMetadata: ViewSectionMetadata | undefined;
  let pendingMetadataLine: number | undefined;

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const metadataMatch = METADATA_REGEX.exec(trimmed);
    if (metadataMatch) {
      const parsed = parseMetadata(metadataMatch[1]);
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

    const node: ViewSectionWithLocation = {
      level,
      title,
      children: [],
      metadata: pendingMetadata,
      startLine: pendingMetadataLine ?? index,
      endLine: lines.length - 1,
    };

    pendingMetadata = undefined;
    pendingMetadataLine = undefined;

    while (stack.length && stack[stack.length - 1].level >= level) {
      const popped = stack.pop()!;
      popped.endLine = Math.max(popped.startLine, index - 1);
    }

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

function parseMetadata(value: string): ViewSectionMetadata | undefined {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return undefined;
    const metadata: ViewSectionMetadata = { raw: parsed as Record<string, unknown> };

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
