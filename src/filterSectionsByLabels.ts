import type { ViewSection } from "./model/index.js";

interface FilterOptions {
  labels: string[];
}

/**
 * Keep only sections whose labels match any of the provided values.
 */
export function filterSectionsByLabels(
  sections: ViewSection[],
  { labels }: FilterOptions
): ViewSection[] {
  const labelSet = new Set(labels);

  const prune = (section: ViewSection): ViewSection[] => {
    const matches = section.metadata?.labels?.some(label => labelSet.has(label)) ?? false;

    const filteredChildren = section.children.flatMap(prune);

    if (matches) {
      return [{ ...section, children: filteredChildren }];
    }

    return filteredChildren;
  };

  return sections
    .flatMap(prune);
}
