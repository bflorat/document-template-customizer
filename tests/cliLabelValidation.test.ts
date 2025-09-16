import { describe, expect, it } from "vitest";
import type { TemplateLabelDefinition, TemplateWithViews } from "../src/model";
import { findUnknownLabels } from "../src/cli/generate-template";

const defs: TemplateLabelDefinition[] = [
  { name: "level", available_values: ["basic", "advanced"] },
  { name: "persistence" },
];

const views: TemplateWithViews["views"] = [
  {
    name: "Demo",
    file: "demo.adoc",
    url: "https://example.com/demo.adoc",
    content: "",
    sections: [
      {
        level: 1,
        title: "Intro",
        children: [],
        metadata: { labels: ["level::basic"] },
      },
    ],
  },
];

describe("findUnknownLabels", () => {
  it("returns empty list when labels are declared", () => {
    const result = findUnknownLabels(["level::basic", "persistence"], defs, views);
    expect(result).toEqual([]);
  });

  it("returns unknown labels", () => {
    const result = findUnknownLabels(["level::overvie", "persistence"], defs, views);
    expect(result).toEqual(["level::overvie"]);
  });

  it("treats all labels as unknown when definitions missing", () => {
    const emptyViews: TemplateWithViews["views"] = [];
    expect(findUnknownLabels(["anything"], undefined, emptyViews)).toEqual(["anything"]);
  });
});
