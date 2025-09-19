// tests/fetchTemplateWithParts.test.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchTemplateMetadata, fetchTemplateAndParts } from "../src/fetchTemplateMetadata";
import {
  TemplateMetadataNotFoundError,
  PartFetchError,
  type TemplateMetadata,
  type TemplateLabelDefinition,
} from "../src/model";

// ----------- Helpers -----------

type MockResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

const ok = (body: string): MockResponse => ({
  ok: true,
  status: 200,
  text: async () => body,
});

const http = (status: number, body = ""): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

/**
 * Build a fetch mock that returns different responses based on URL substrings.
 * - routes: array of [matcher, response]
 *   matcher can be a string (substring match) or RegExp (test against URL)
 * - If no route matches, returns 404.
 */
function buildFetchMock(
  routes: Array<
    | [string | RegExp, MockResponse | ((url: string, init?: RequestInit) => Promise<MockResponse>)]
  >
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    for (const [matcher, responder] of routes) {
      const match =
        typeof matcher === "string" ? url.includes(matcher) : (matcher as RegExp).test(url);
      if (match) {
        if (typeof responder === "function") return responder(url, init);
        return responder;
      }
    }
    return http(404);
  });
}

// (helper removed) hanging responder not used anymore

// ----------- Fixtures -----------

const BASE = "https://example.com/tpl";
const METADATA_URL = `${BASE}/base-template-metadata.yaml`;

const YAML_OK = `
author: Bertrand Florat
license: CC BY-SA 4.0
parts:
  - name: Application
    file: view-application.adoc
  - name: Development
    file: view-development.adoc
  - name: Security
    file: security.adoc
labels:
  - name: level
    available_values:
      - basic
      - intermediate
      - advanced
  - name: project_size
    available_values:
      - small
      - medium
      - large
  - name: persistence
  - name: green-IT
`;

const PART_APP = `# Application Part\n\n//🏷{"id":"intro","labels":["level::basic","project_size::medium"]}\n## Overview\nDetails\n\n//🏷{"id":"deep","labels":["level::advanced"],"link_to":["intro","appendix"]}\n### Deep Dive\nMore details\n`;
const PART_DEV = `# Development Part\n\nContent D\n`;
const PART_SEC = `# Security Part\n\nContent S\n`;
const README_BODY = `= Template

This is the base readme.
`;

describe("fetchTemplateMetadata", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches and parses metadata", async () => {
    const fetchMock = buildFetchMock([[METADATA_URL, ok(YAML_OK)]]);
    const res = await fetchTemplateMetadata(`${BASE}/`, { fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledWith(METADATA_URL, expect.any(Object));
    const data: TemplateMetadata = res.data;
    expect(data.author).toBe("Bertrand Florat");
    expect(data.license).toBe("CC BY-SA 4.0");
    expect(data.parts).toHaveLength(3);
    expect(data.parts[0]).toEqual({ name: "Application", file: "view-application.adoc" });
    expect(data.labels).toBeDefined();
    const labels = data.labels as TemplateLabelDefinition[];
    expect(labels).toHaveLength(4);
    expect(labels[0]).toEqual({
      name: "level",
      available_values: ["basic", "intermediate", "advanced"],
    });
  });

  it("throws TemplateMetadataNotFoundError on 404", async () => {
    const fetchMock = buildFetchMock([]); // no routes -> 404
    await expect(
      fetchTemplateMetadata(BASE, { fetchImpl: fetchMock })
    ).rejects.toBeInstanceOf(TemplateMetadataNotFoundError);
  });
});

describe("fetchTemplateAndParts", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches metadata and all parts successfully", async () => {
    const fetchMock = buildFetchMock([
      [METADATA_URL, ok(YAML_OK)],
      [`${BASE}/view-application.adoc`, ok(PART_APP)],
      [`${BASE}/view-development.adoc`, ok(PART_DEV)],
      [`${BASE}/security.adoc`, ok(PART_SEC)],
      [`${BASE}/README.adoc`, ok(README_BODY)],
    ]);

    const res = await fetchTemplateAndParts(`${BASE}//`, { fetchImpl: fetchMock, concurrency: 2 });

    expect(res.metadata.url).toBe(METADATA_URL);
    expect(res.parts).toHaveLength(3);
    expect(res.readme.file).toBe("README.adoc");
    expect(res.readme.content).toContain("Template");

    // Check one part content
    const app = res.parts.find(v => v.file === "view-application.adoc")!;
    expect(app.url).toBe(`${BASE}/view-application.adoc`);
    expect(app.content).toContain("Application Part");
    expect(app.sections).toBeDefined();
    const rootSection = app.sections![0];
    expect(rootSection.title).toBe("Application Part");
    const overview = rootSection.children[0];
    expect(overview.title).toBe("Overview");
    expect(overview.metadata?.id).toBe("intro");
    expect(overview.metadata?.labels).toEqual(["level::basic", "project_size::medium"]);
    const deepDive = overview.children[0];
    expect(deepDive.title).toBe("Deep Dive");
    expect(deepDive.metadata?.id).toBe("deep");
    expect(deepDive.metadata?.linkTo).toEqual(["intro", "appendix"]);
  });

  it("throws PartFetchError when one part is missing and strict=true (default)", async () => {
    const fetchMock = buildFetchMock([
      [METADATA_URL, ok(YAML_OK)],
      [`${BASE}/view-application.adoc`, ok(PART_APP)],
      [`${BASE}/view-development.adoc`, http(404)],
      [`${BASE}/security.adoc`, ok(PART_SEC)],
      [`${BASE}/README.adoc`, ok(README_BODY)],
    ]);

    await expect(fetchTemplateAndParts(BASE, { fetchImpl: fetchMock })).rejects.toBeInstanceOf(
      PartFetchError
    );

    try {
      await fetchTemplateAndParts(BASE, { fetchImpl: fetchMock });
      throw new Error("unreachable");
    } catch (e: any) {
      expect(e).toBeInstanceOf(PartFetchError);
      expect(e.failures).toHaveLength(1);
      expect(e.failures[0].file).toBe("view-development.adoc");
      expect(e.failures[0].status).toBe(404);
    }
  });

  it("returns partial success when a part fails and strict=false", async () => {
    const fetchMock = buildFetchMock([
      [METADATA_URL, ok(YAML_OK)],
      [`${BASE}/view-application.adoc`, ok(PART_APP)],
      [`${BASE}/view-development.adoc`, http(500)],
      [`${BASE}/security.adoc`, ok(PART_SEC)],
      [`${BASE}/README.adoc`, ok(README_BODY)],
    ]);

    const res = await fetchTemplateAndParts(BASE, {
      fetchImpl: fetchMock,
      strict: false,
      concurrency: 3,
    });

    // Only 2 succeeded
    expect(res.parts.map(v => v.file).sort()).toEqual(
      ["security.adoc", "view-application.adoc"].sort()
    );
  });


  it("handles empty metadata file gracefully (error)", async () => {
    const fetchMock = buildFetchMock([[METADATA_URL, ok("   \n  ")]]);
    await expect(
      fetchTemplateAndParts(BASE, { fetchImpl: fetchMock })
    ).rejects.toThrow(/Empty base-template-metadata\.yaml/);
  });

  it("fails when README.adoc is missing", async () => {
    const fetchMock = buildFetchMock([
      [METADATA_URL, ok(YAML_OK)],
      [`${BASE}/view-application.adoc`, ok(PART_APP)],
      [`${BASE}/view-development.adoc`, ok(PART_DEV)],
      [`${BASE}/security.adoc`, ok(PART_SEC)],
    ]);

    await expect(
      fetchTemplateAndParts(BASE, { fetchImpl: fetchMock })
    ).rejects.toThrow(/README \(adoc\/md\) is required/);
  });

  it("accepts README.md in addition to README.adoc", async () => {
    const fetchMock = buildFetchMock([
      [METADATA_URL, ok(YAML_OK)],
      [`${BASE}/view-application.adoc`, ok(PART_APP)],
      [`${BASE}/view-development.adoc`, ok(PART_DEV)],
      [`${BASE}/security.adoc`, ok(PART_SEC)],
      [`${BASE}/README.md`, ok(README_BODY)],
    ]);

    const res = await fetchTemplateAndParts(BASE, { fetchImpl: fetchMock });
    expect(res.readme.file).toBe("README.md");
    expect(res.readme.content).toContain("Template");
  });
});
