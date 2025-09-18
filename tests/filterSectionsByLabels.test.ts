import { describe, it, expect } from "vitest";
import type { ViewSection } from "../src/model";
import { filterSectionsByLabels } from "../src/filterSectionsByLabels";

const tree: ViewSection[] = [
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
  it("keeps only sections that match labels", () => {
    const filtered = filterSectionsByLabels(tree, { labels: ["keep"] });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Context");
    expect(filtered[0].children).toHaveLength(0);
  });

  it("drops unrelated sections when no label matches", () => {
    const filtered = filterSectionsByLabels(tree, { labels: ["absent"] });

    expect(filtered).toHaveLength(0);
  });
});
