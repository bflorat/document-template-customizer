import type { ViewSection } from "./model/index.js";

export type LabelFilterMode = "matching" | "nonMatching";

interface FilterOptions {
  labels: string[];
  mode: LabelFilterMode;
}

/**
 * Filter a tree of sections by labels. When a section is removed its entire subtree is dropped.
 */
export function filterSectionsByLabels(
  sections: ViewSection[],
  { labels, mode }: FilterOptions
): ViewSection[] {
  const labelSet = new Set(labels);

  const prune = (section: ViewSection): ViewSection | null => {
    const matches = section.metadata?.labels?.some(label => labelSet.has(label)) ?? false;

    if (mode === "nonMatching" && matches) {
      return null;
    }

    const filteredChildren = section.children
      .map(prune)
      .filter((child): child is ViewSection => child !== null);

    if (mode === "matching") {
      if (!matches && filteredChildren.length === 0) {
        return null;
      }
      return { ...section, children: filteredChildren };
    }

    return { ...section, children: filteredChildren };
  };

  return sections
    .map(prune)
    .filter((section): section is ViewSection => section !== null);
}
