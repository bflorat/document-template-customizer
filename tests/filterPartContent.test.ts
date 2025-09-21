import { describe, expect, it } from "vitest";
import { filterPartContent } from "../src/filterPartContent";

const SAMPLE_VIEW = `# Application\n:sectnums: 4\n:toc: left\n\n//🏷{"labels":["include-me"]}\n## Included Section\nContent kept.\n\n//🏷{"labels":["exclude-me"]}\n## Removed Section\nThis should disappear.\n\n## Plain Section\nNo metadata here.\n`;

describe("filterPartContent", () => {
  it("supports AsciiDoc '=' style headings alongside '#'", () => {
    const view = `= Root\n\n//🏷{"labels":["include-me"]}\n== Included\nBody\n\n== Plain\nText`;
    const res = filterPartContent(view, { includeLabels: ["include-me"] });
    expect(res.templateContent).toContain("= Root");
    expect(res.templateContent).toContain("== Included");
    expect(res.templateContent).not.toContain("== Plain\nText");
    expect(res.blankContent).toContain("= Root");
    expect(res.blankContent).toContain("== Included");
  });
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
    expect(result.blankContent.trim()).toBe([
      "# Application",
      ":sectnums: 4",
      ":toc: left",
      "",
      "## Included Section",
    ].join("\n"));
    expect(result.keptSections).toBeGreaterThan(0);
  });

  it("honors wildcard label values", () => {
    const viewWithWildcards = `# Demo\n\n//🏷{"labels":["project_size::large"]}\n## Large Section\nBig\n\n//🏷{"labels":["project_size::small"]}\n## Small Section\nSmall`;
    const result = filterPartContent(viewWithWildcards, {
      includeLabels: ["project_size::*"],
      wildcard: true,
    });
    expect(result.templateContent).toContain("Large Section");
    expect(result.templateContent).toContain("Small Section");
  });


  it("keeps the top-level heading when nothing else matches", () => {
    const result = filterPartContent(SAMPLE_VIEW, { includeLabels: ["other"] });
    expect(result.templateContent.trim()).toBe("# Application");
    expect(result.blankContent.trim()).toBe("# Application");
    expect(result.keptSections).toBe(0);
  });

  it("excludes non matching subsections even when parent matches", () => {
    const nestedView = `# Root\n\n//🏷{"labels":["keep-parent"]}\n## Matching Parent\nIntro that stays.\n\n//🏷{"labels":["drop-me"]}\n### Child Removed\nRemove me.\n\n### Child Without Labels\nAlso removed.`;

    const result = filterPartContent(nestedView, { includeLabels: ["keep-parent"] });

    expect(result.templateContent).toContain("## Matching Parent");
    expect(result.templateContent).toContain("Intro that stays.");
    expect(result.templateContent).not.toContain("Child Removed");
    expect(result.templateContent).not.toContain("Child Without Labels");
  });

  it("keeps sections labeled with wildcard when a specific value is selected", () => {
    const nestedView = `# Root\n\n//🏷{"labels":["project_size::*"]}\n## Intro\nIntro kept.\n\n//🏷{"labels":["project_size::medium"]}\n### Medium Only\nShould go away.`;

    const result = filterPartContent(nestedView, { includeLabels: ["project_size::large"] });

    expect(result.templateContent).toContain("## Intro");
    expect(result.templateContent).toContain("Intro kept.");
    expect(result.templateContent).not.toContain("Medium Only");
  });

  it("requires all labels on a section to match the selection (AND)", () => {
    const view = `# Root\n\n//🏷{"labels":["include-me","other"]}\n## Both\nKeep only if both labels selected.\n\n//🏷{"labels":["include-me"]}\n## Only Include\nShould stay when only include-me is selected.`;

    const onlyInclude = filterPartContent(view, { includeLabels: ["include-me"] });
    expect(onlyInclude.templateContent).toContain("## Only Include");
    expect(onlyInclude.templateContent).not.toContain("## Both");

    const both = filterPartContent(view, { includeLabels: ["include-me","other"] });
    expect(both.templateContent).toContain("## Only Include");
    expect(both.templateContent).toContain("## Both");
  });

  it("inserts 'See also' paragraph with cross-ref links for sections with link_to", () => {
    const view = `# Root\n\n//🏷{"id":"s1"}\n## First\nA\n\n//🏷{"id":"s2","link_to":["s1"]}\n## Second\nB`;
    const result = filterPartContent(view, {
      includeLabels: [],
      linkIndex: { s1: "First", s2: "Second" },
    });
    expect(result.templateContent).toContain("[#s1]");
    expect(result.templateContent).toContain("TIP: See also <<s1,First>>.");
    expect(result.blankContent).toContain("[#s1]");
    expect(result.blankContent).toContain("TIP: See also <<s1,First>>.");
  });

  it("omits anchors when includeAnchors=false but keeps 'See also'", () => {
    const view = `# Root\n\n//🏷{"id":"s1"}\n## First\nA\n\n//🏷{"id":"s2","link_to":["s1"]}\n## Second\nB`;
    const result = filterPartContent(view, {
      includeLabels: [],
      linkIndex: { s1: "First", s2: "Second" },
      includeAnchors: false,
    });
    expect(result.templateContent).not.toContain("[#s1]");
    expect(result.templateContent).toContain("TIP: See also <<s1,First>>.");
    expect(result.blankContent).not.toContain("[#s1]");
    expect(result.blankContent).toContain("TIP: See also <<s1,First>>.");
  });

  it("keeps anchor directly above heading in blank output", () => {
    const view = `# Root\n\n//🏷{"id":"s1"}\n## First\nA\n\n//🏷{"id":"s2"}\n### Second\nB`;
    const result = filterPartContent(view, { includeLabels: [] });
    expect(result.blankContent).toContain("[#s1]\n## First");
    expect(result.blankContent).toContain("[#s2]\n### Second");
  });

  it("keeps exactly one blank line between sections in blank output", () => {
    const view = `# Root\n\n//🏷{"id":"s1"}\n## First\nA\n\n//🏷{"id":"s2","link_to":["s1"]}\n## Second\nB`;
    const result = filterPartContent(view, {
      includeLabels: [],
      linkIndex: { s1: "First", s2: "Second" },
    });
    expect(result.blankContent).toMatch(/\[#s1]\n## First\n\n\[#s2]\n## Second/);
  });

  it("unlabeled parent does not block matching children", () => {
    const view = `# Root\n\n//🏷{"labels":["a"]}\n## Child A\nA\n\n//🏷{"labels":["b"]}\n## Child B\nB`;

    const res = filterPartContent(view, { includeLabels: ["a", "b", "c", "d"] });
    expect(res.templateContent).toContain("## Child A");
    expect(res.templateContent).toContain("## Child B");
  });
});
