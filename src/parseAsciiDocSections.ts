import type { ViewSection } from "./model";

const HEADING_REGEX = /^(#{1,6})\s+(.*)$/;

export function parseAsciiDocSections(content: string): ViewSection[] {
  const lines = content.split(/\r?\n/);
  const roots: ViewSection[] = [];
  const stack: ViewSection[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const match = HEADING_REGEX.exec(line);
    if (!match) continue;

    const [, hashes, titleRaw] = match;
    const level = hashes.length;
    const title = titleRaw.trim();
    if (!title) continue;

    const node: ViewSection = { level, title, children: [] };

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
