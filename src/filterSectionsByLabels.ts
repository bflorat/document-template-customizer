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
    const matches =
      section.metadata?.labels?.some(label => matchesLabel(label, labelSet, wildcard)) ?? false;

    const filteredChildren = section.children.flatMap(prune);

    if (matches) {
      return [{ ...section, children: filteredChildren }];
    }

    return filteredChildren;
  };

  return sections
    .flatMap(prune);
}

function matchesLabel(label: string, candidates: Set<string>, wildcard: boolean): boolean {
  if (candidates.has(label)) return true;
  if (!wildcard) return false;

  const [namespace = "", value = ""] = label.split('::', 2);
  if (!namespace || !value) return false;
  return candidates.has(`${namespace}::*`);
}
