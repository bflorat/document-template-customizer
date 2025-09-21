import { describe, expect, it } from "vitest";
import type { TemplateLabelDefinition, TemplateWithParts } from "../src/model";
import { findUnknownLabels, parseArgs } from "../src/cli/generate-template";

const defs: TemplateLabelDefinition[] = [
  { name: "level", available_values: ["basic", "advanced"] },
  { name: "persistence" },
];

const parts: TemplateWithParts["parts"] = [
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
    const result = findUnknownLabels(["level::basic", "persistence"], defs, parts);
    expect(result).toEqual([]);
  });

  it("returns unknown labels", () => {
    const result = findUnknownLabels(["level::overvie", "persistence"], defs, parts);
    expect(result).toEqual(["level::overvie"]);
  });

  it("treats all labels as unknown when definitions missing", () => {
    const emptyParts: TemplateWithParts["parts"] = [];
    expect(findUnknownLabels(["anything"], undefined, emptyParts)).toEqual(["anything"]);
  });
});

describe("parseArgs", () => {
  it("supports --opt value format", () => {
    const parsed = parseArgs([
      "--base-url",
      "https://example.com",
      "--include",
      "level::basic,persistence",
      "--output",
      "result.zip",
    ]);

    expect(parsed.baseUrl).toBe("https://example.com");
    expect(parsed.include).toEqual(["level::basic", "persistence"]);
    expect(parsed.output).toBe("result.zip");
    expect(parsed.includeAnchors).toBe(true);
  });

  it("supports --opt=value format", () => {
    const parsed = parseArgs([
      "--base-url=https://example.com",
      "--include=level::basic,persistence",
      "--output=result.zip",
      "--output-file=/tmp/output.zip",
    ]);

    expect(parsed.baseUrl).toBe("https://example.com");
    expect(parsed.include).toEqual(["level::basic", "persistence"]);
    expect(parsed.output).toBe("result.zip");
    expect(parsed.outputFile).toBe("/tmp/output.zip");
    expect(parsed.includeAnchors).toBe(true);
  });

  it("supports --no-anchors flag", () => {
    const parsed = parseArgs([
      "--base-url=https://example.com",
      "--no-anchors",
    ]);
    expect(parsed.baseUrl).toBe("https://example.com");
    expect(parsed.includeAnchors).toBe(false);
  });
});
