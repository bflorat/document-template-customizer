import { describe, expect, it } from "vitest";
import { filterPartContent } from "../src/filterPartContent";

const SAMPLE_VIEW = `# Application\n:sectnums: 4\n:toc: left\n\n//🏷{"labels":["include-me"]}\n## Included Section\nContent kept.\n\n//🏷{"labels":["exclude-me"]}\n## Removed Section\nThis should disappear.\n\n## Plain Section\nNo metadata here.\n`;

describe("filterPartContent", () => {
  it("supports AsciiDoc '=' style headings alongside '#' (keeps unlabeled)", () => {
    const view = `= Root\n\n//🏷{"labels":["include-me"]}\n== Included\nBody\n\n== Plain\nText`;
    const res = filterPartContent(view, { includeLabels: ["include-me"] });
    expect(res.templateContent).toContain("= Root");
    expect(res.templateContent).toContain("== Included");
    expect(res.templateContent).toContain("== Plain\nText");
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

  it("keeps only sections matching include labels (keeps unlabeled)", () => {
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
      "",
      "## Plain Section",
    ].join("\n"));
    expect(result.keptSections).toBeGreaterThan(0);
  });

  it("keeps the top-level heading and unlabeled sections when nothing else matches", () => {
    const result = filterPartContent(SAMPLE_VIEW, { includeLabels: ["other"] });
    expect(result.templateContent).toContain("# Application");
    expect(result.blankContent).toContain("# Application");
    expect(result.templateContent).toContain("## Plain Section");
    expect(result.blankContent).toContain("## Plain Section");
    expect(result.keptSections).toBeGreaterThan(0);
  });

  it("keeps unlabeled subsections even when parent matches", () => {
    const nestedView = `# Root\n\n//🏷{"labels":["keep-parent"]}\n## Matching Parent\nIntro that stays.\n\n//🏷{"labels":["drop-me"]}\n### Child Removed\nRemove me.\n\n### Child Without Labels\nAlso removed.`;

    const result = filterPartContent(nestedView, { includeLabels: ["keep-parent"] });

    expect(result.templateContent).toContain("## Matching Parent");
    expect(result.templateContent).toContain("Intro that stays.");
    expect(result.templateContent).not.toContain("Child Removed");
    expect(result.templateContent).toContain("Child Without Labels");
  });

  it("drops unlabeled subsections when labeled parent does not match", () => {
    const view = `# Root\n\n//🏷{"labels":["foo"]}\n## Parent Foo\nIntro\n\n### Unlabeled Child\nBody`;
    const res = filterPartContent(view, { includeLabels: ["bar"] });
    expect(res.templateContent).toContain("# Root");
    expect(res.templateContent).not.toContain("## Parent Foo");
    expect(res.templateContent).not.toContain("### Unlabeled Child");
  });

  it("drops a labeled section when its label is not selected", () => {
    const view = `# Root\n\n//🏷{"labels":["context"]}\n## Introduction\nBody`;
    const result = filterPartContent(view, { includeLabels: ["other"] });
    expect(result.templateContent).toContain("# Root");
    expect(result.templateContent).not.toContain("## Introduction");
  });

  it("keeps an unlabeled section when no labels are selected (filtered template)", () => {
    const view = `# Root\n\n## Unlabeled\nBody`;
    const result = filterPartContent(view, { includeLabels: [] });
    expect(result.templateContent).toContain("## Unlabeled");
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

  it("localizes 'See also' with manifest language (fr)", () => {
    const view = `# Root\n\n//🏷{"id":"s1"}\n## Intro\nA\n\n//🏷{"id":"s2","link_to":["s1"]}\n## Suite\nB`;
    const result = filterPartContent(view, {
      includeLabels: [],
      linkIndex: { s1: "Intro" },
      manifestLang: 'fr',
    });
    expect(result.templateContent).toContain("TIP: Voir aussi <<s1,Intro>>.");
    expect(result.blankContent).toContain("TIP: Voir aussi <<s1,Intro>>.");
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

  it("keeps only PRE-FILLED block content in blank output (without markers)", () => {
    const view = `# Root\n\n## With Prefilled\n[PRE-FILLED]\n====\nGuidance for blank\n====\n\n## Without Prefilled\nRegular body that should not appear`;
    const result = filterPartContent(view, { includeLabels: [] });
    // Template has both regular body and prefilled content, but no PRE-FILLED markers
    expect(result.templateContent).toContain("Guidance for blank");
    expect(result.templateContent).toContain("Regular body");
    expect(result.templateContent).not.toContain("[PRE-FILLED]");
    expect(result.templateContent).not.toMatch(/^====\s*$/m);
    // Blank keeps only the content from the PRE-FILLED block, without markers
    expect(result.blankContent).toContain("Guidance for blank");
    expect(result.blankContent).not.toContain("[PRE-FILLED]");
    expect(result.blankContent).not.toMatch(/^====\s*$/m);
    expect(result.blankContent).not.toContain("Regular body");
  });

  it("unlabeled parent does not block matching children", () => {
    const view = `# Root\n\n//🏷{"labels":["a"]}\n## Child A\nA\n\n//🏷{"labels":["b"]}\n## Child B\nB`;

    const res = filterPartContent(view, { includeLabels: ["a", "b", "c", "d"] });
    expect(res.templateContent).toContain("## Child A");
    expect(res.templateContent).toContain("## Child B");
  });
});
