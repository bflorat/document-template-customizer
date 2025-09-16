import type { ViewSection } from "./model/index.js";

interface FilterOptions {
  labels: string[];
}

/**
 * Keep only sections whose labels match any of the provided values, retaining parents of matches.
 */
export function filterSectionsByLabels(
  sections: ViewSection[],
  { labels }: FilterOptions
): ViewSection[] {
  const labelSet = new Set(labels);

  const prune = (section: ViewSection): ViewSection | null => {
    const matches = section.metadata?.labels?.some(label => labelSet.has(label)) ?? false;

    const filteredChildren = section.children
      .map(prune)
      .filter((child): child is ViewSection => child !== null);

    if (!matches && filteredChildren.length === 0) {
      return null;
    }

    return { ...section, children: filteredChildren };
  };

  return sections
    .map(prune)
    .filter((section): section is ViewSection => section !== null);
}
