import type { PartSection } from "./model/index.js";

interface FilterOptions {
  labels: string[];
}

/**
 * Keep only sections whose labels match any of the provided values.
 */
export function filterSectionsByLabels(
  sections: PartSection[],
  { labels }: FilterOptions
): PartSection[] {
  const labelSet = new Set(labels);

  const prune = (section: PartSection): PartSection[] => {
    const labels = section.metadata?.labels ?? [];
    const matches = labels.length
      ? labels.every(label => matchesLabel(label, labelSet))
      : false;

    if (!matches) return [];

    const filteredChildren = section.children.flatMap(prune);
    return [{ ...section, children: filteredChildren }];
  };

  return sections
    .flatMap(prune);
}

function matchesLabel(label: string, candidates: Set<string>): boolean {
  const trimmed = label.trim();
  return candidates.has(trimmed);
}
