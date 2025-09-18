import { describe, it, expect } from "vitest";
import type { PartSection } from "../src/model";
import { filterSectionsByLabels } from "../src/filterSectionsByLabels";

const tree: PartSection[] = [
  {
    level: 1,
    title: "Introduction",
    children: [
      {
        level: 2,
        title: "Context",
        metadata: { labels: ["keep"] },
        children: [
          {
            level: 3,
            title: "History",
            children: [],
          },
        ],
      },
      {
        level: 2,
        title: "Scope",
        children: [],
      },
    ],
  },
  {
    level: 1,
    title: "Deployment",
    metadata: { labels: ["drop"] },
    children: [
      {
        level: 2,
        title: "Runtime",
        children: [],
      },
    ],
  },
];

describe("filterSectionsByLabels", () => {
  it("drops children when parent doesn't match (no bubbling)", () => {
    const filtered = filterSectionsByLabels(tree, { labels: ["keep"] });
    expect(filtered).toHaveLength(0);
  });

  it("drops unrelated sections when no label matches", () => {
    const filtered = filterSectionsByLabels(tree, { labels: ["absent"] });

    expect(filtered).toHaveLength(0);
  });
});
