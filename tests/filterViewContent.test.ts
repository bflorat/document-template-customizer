import { describe, expect, it } from "vitest";
import { filterViewContent } from "../src/filterViewContent";

const SAMPLE_VIEW = `# Application\n\n🏷{"labels":["include-me"]}\n## Included Section\nContent kept.\n\n🏷{"labels":["exclude-me"]}\n## Removed Section\nThis should disappear.\n\n## Plain Section\nNo metadata here.\n`;

describe("filterViewContent", () => {
  it("removes metadata lines while keeping structure", () => {
    const result = filterViewContent(SAMPLE_VIEW, {});
    expect(result.templateContent).toContain("🏷");
    expect(result.templateContent).toContain("# Application");
    expect(result.blankContent).not.toContain("🏷");
    expect(result.blankContent).toContain("## Included Section");
    expect(result.blankContent).toContain("## Removed Section");
  });

  it("keeps only sections matching include labels", () => {
    const result = filterViewContent(SAMPLE_VIEW, { includeLabels: ["include-me"] });
    expect(result.templateContent).toContain("## Included Section");
    expect(result.templateContent).toContain("🏷");
    expect(result.templateContent).not.toContain('"exclude-me"');
    expect(result.blankContent).toContain("## Included Section");
    expect(result.blankContent).not.toContain("## Removed Section");
    expect(result.blankContent).not.toContain("## Plain Section");
    expect(result.keptSections).toBeGreaterThan(0);
  });

  it("returns empty content when nothing matches", () => {
    const result = filterViewContent(SAMPLE_VIEW, { includeLabels: ["other"] });
    expect(result.templateContent).toBe("");
    expect(result.blankContent).toBe("");
    expect(result.keptSections).toBe(0);
  });
});
