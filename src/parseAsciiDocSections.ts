import type { ViewSection, ViewSectionLabels } from "./model";

const HEADING_REGEX = /^\s*(#{1,6})\s+(.*)$/;
const METADATA_REGEX = /^\s*🏷\s*(\{.*\})\s*$/;

export function parseAsciiDocSections(content: string): ViewSection[] {
  const lines = content.split(/\r?\n/);
  const roots: ViewSection[] = [];
  const stack: ViewSection[] = [];
  let pendingMetadata: ViewSectionLabels | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const metadataMatch = METADATA_REGEX.exec(trimmed);
    if (metadataMatch) {
      const parsed = parseMetadata(metadataMatch[1]);
      if (parsed) pendingMetadata = parsed;
      continue;
    }

    const match = HEADING_REGEX.exec(line);
    if (!match) {
      if (trimmed) pendingMetadata = undefined;
      continue;
    }

    const [, hashes, titleRaw] = match;
    const level = hashes.length;
    const title = titleRaw.trim();
    if (!title) continue;

    const node: ViewSection = {
      level,
      title,
      children: [],
      metadata: pendingMetadata,
    };

    pendingMetadata = undefined;

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (!stack.length) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return roots;
}

function parseMetadata(value: string): ViewSectionLabels | undefined {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return undefined;
    const metadata: ViewSectionLabels = { raw: parsed as Record<string, unknown> };

    if (typeof (parsed as any).id === "string") {
      metadata.id = (parsed as any).id;
    }
    if (Array.isArray((parsed as any).labels)) {
      const labels = (parsed as any).labels.filter((label: unknown): label is string => typeof label === "string");
      if (labels.length) metadata.labels = labels;
    }
    if (typeof (parsed as any).link_to === "string") {
      metadata.linkTo = (parsed as any).link_to;
    }

    return metadata;
  } catch (error) {
    return undefined;
  }
}
