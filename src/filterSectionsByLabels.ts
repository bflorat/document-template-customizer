import type { PartSection } from "./model/index.js";

interface FilterOptions {
  labels: string[];
  wildcard?: boolean;
}

/**
 * Keep only sections whose labels match any of the provided values.
 */
export function filterSectionsByLabels(
  sections: PartSection[],
  { labels, wildcard = false }: FilterOptions
): PartSection[] {
  const labelSet = new Set(labels);

  const prune = (section: PartSection): PartSection[] => {
    const labels = section.metadata?.labels ?? [];
    const matches = labels.length
      ? labels.every(label => matchesLabel(label, labelSet, wildcard))
      : false;

    if (!matches) return [];

    const filteredChildren = section.children.flatMap(prune);
    return [{ ...section, children: filteredChildren }];
  };

  return sections
    .flatMap(prune);
}

function matchesLabel(label: string, candidates: Set<string>, wildcard: boolean): boolean {
  const trimmed = label.trim();
  if (candidates.has(trimmed)) return true;
  if (!wildcard) return false;

  const [ns = "", val = ""] = trimmed.split('::', 2);
  if (!ns) return false;

  // Candidate wildcard matches concrete label
  if (val && candidates.has(`${ns}::*`)) return true;

  // Label wildcard matches any candidate value in same namespace
  if (val === '*') {
    for (const cand of candidates) {
      if (cand.startsWith(`${ns}::`)) return true;
    }
  }

  return false;
}
