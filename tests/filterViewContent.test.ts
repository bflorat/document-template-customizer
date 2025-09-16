import { describe, expect, it } from "vitest";
import { filterViewContent } from "../src/filterViewContent";

const SAMPLE_VIEW = `# Application\n\n🏷{"labels":["include-me"]}\n## Included Section\nContent kept.\n\n🏷{"labels":["exclude-me"]}\n## Removed Section\nThis should disappear.\n\n## Plain Section\nNo metadata here.\n`;

describe("filterViewContent", () => {
  it("removes metadata lines while keeping structure", () => {
    const result = filterViewContent(SAMPLE_VIEW, {});
    expect(result.content).not.toContain("🏷");
    expect(result.content).toContain("# Application");
    expect(result.content).toContain("## Included Section");
    expect(result.content).toContain("## Removed Section");
  });

  it("keeps only sections matching include labels", () => {
    const result = filterViewContent(SAMPLE_VIEW, { includeLabels: ["include-me"] });
    expect(result.content).toContain("## Included Section");
    expect(result.content).not.toContain("## Removed Section");
    expect(result.content).not.toContain("## Plain Section");
    expect(result.keptSections).toBeGreaterThan(0);
  });

  it("excludes sections that match excluded labels", () => {
    const result = filterViewContent(SAMPLE_VIEW, { excludeLabels: ["exclude-me"] });
    expect(result.content).toContain("## Included Section");
    expect(result.content).not.toContain("## Removed Section");
    expect(result.content).toContain("## Plain Section");
  });

  it("returns empty content when nothing matches", () => {
    const result = filterViewContent(SAMPLE_VIEW, { includeLabels: ["other"] });
    expect(result.content).toBe("");
    expect(result.keptSections).toBe(0);
  });
});
