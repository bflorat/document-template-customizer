import { describe, expect, it } from "vitest";
import { filterPartContent } from "../src/filterPartContent";

const SAMPLE_VIEW = `# Application\n:sectnums: 4\n:toc: left\n\n🏷{"labels":["include-me"]}\n## Included Section\nContent kept.\n\n🏷{"labels":["exclude-me"]}\n## Removed Section\nThis should disappear.\n\n## Plain Section\nNo metadata here.\n`;

describe("filterPartContent", () => {
  it("removes metadata lines while keeping structure", () => {
    const result = filterPartContent(SAMPLE_VIEW, {});
    expect(result.templateContent).not.toContain("🏷");
    expect(result.templateContent).toContain("# Application");
    expect(result.blankContent.trim()).toBe(
      [
        "# Application",
        ":sectnums: 4",
        ":toc: left",
        "",
        "## Included Section",
        "",
        "## Removed Section",
        "",
        "## Plain Section",
      ].join("\n")
    );
  });

  it("keeps only sections matching include labels", () => {
    const result = filterPartContent(SAMPLE_VIEW, { includeLabels: ["include-me"] });
    expect(result.templateContent).toContain("## Included Section");
    expect(result.templateContent).not.toContain("🏷");
    expect(result.templateContent).not.toContain('"exclude-me"');
    expect(result.blankContent.trim()).toBe("## Included Section");
    expect(result.keptSections).toBeGreaterThan(0);
  });

  it("returns empty content when nothing matches", () => {
    const result = filterPartContent(SAMPLE_VIEW, { includeLabels: ["other"] });
    expect(result.templateContent).toBe("");
    expect(result.blankContent).toBe("");
    expect(result.keptSections).toBe(0);
  });
});
