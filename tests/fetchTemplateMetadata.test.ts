// tests/fetchTemplateWithViews.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchTemplateMetadata, fetchTemplateAndViews } from "../src/fetchTemplateMetadata";
import {
  TemplateMetadataNotFoundError,
  ViewFetchError,
  type TemplateMetadata,
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

/** A responder that never resolves and respects AbortController to simulate timeouts. */
function hangingResponder() {
  return async (_url: string, init?: RequestInit) =>
    new Promise<MockResponse>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      const onAbort = () => {
        const err: any = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      // never resolve
    });
}

// ----------- Fixtures -----------

const BASE = "https://example.com/tpl";
const METADATA_URL = `${BASE}/template-metadata.yaml`;

const YAML_OK = `
author: Bertrand Florat
license: CC BY-SA 4.0
views:
  - name: Application
    file: view-application.adoc
  - name: Development
    file: view-development.adoc
  - name: Security
    file: security.adoc
`;

const VIEW_APP = `# Application View\n\nIntro\n\n## Overview\nDetails\n\n### Deep Dive\nMore details\n`;
const VIEW_DEV = `# Development View\n\nContent D\n`;
const VIEW_SEC = `# Security View\n\nContent S\n`;

describe("fetchTemplateMetadata", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches and parses metadata", async () => {
    const fetchMock = buildFetchMock([[METADATA_URL, ok(YAML_OK)]]);
    const res = await fetchTemplateMetadata(`${BASE}/`, { fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledWith(METADATA_URL, expect.any(Object));
    const data: TemplateMetadata = res.data;
    expect(data.author).toBe("Bertrand Florat");
    expect(data.license).toBe("CC BY-SA 4.0");
    expect(data.views).toHaveLength(3);
    expect(data.views[0]).toEqual({ name: "Application", file: "view-application.adoc" });
  });

  it("throws TemplateMetadataNotFoundError on 404", async () => {
    const fetchMock = buildFetchMock([]); // no routes -> 404
    await expect(
      fetchTemplateMetadata(BASE, { fetchImpl: fetchMock })
    ).rejects.toBeInstanceOf(TemplateMetadataNotFoundError);
  });
});

describe("fetchTemplateAndViews", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches metadata and all views successfully", async () => {
    const fetchMock = buildFetchMock([
      [METADATA_URL, ok(YAML_OK)],
      [`${BASE}/view-application.adoc`, ok(VIEW_APP)],
      [`${BASE}/view-development.adoc`, ok(VIEW_DEV)],
      [`${BASE}/security.adoc`, ok(VIEW_SEC)],
    ]);

    const res = await fetchTemplateAndViews(`${BASE}//`, { fetchImpl: fetchMock, concurrency: 2 });

    expect(res.metadata.url).toBe(METADATA_URL);
    expect(res.views).toHaveLength(3);

    // Check one view content
    const app = res.views.find(v => v.file === "view-application.adoc")!;
    expect(app.url).toBe(`${BASE}/view-application.adoc`);
    expect(app.content).toContain("Application View");
    expect(app.sections).toBeDefined();
    const rootSection = app.sections![0];
    expect(rootSection.title).toBe("Application View");
    expect(rootSection.children[0].title).toBe("Overview");
    expect(rootSection.children[0].children[0].title).toBe("Deep Dive");
  });

  it("throws ViewFetchError when one view is missing and strict=true (default)", async () => {
    const fetchMock = buildFetchMock([
      [METADATA_URL, ok(YAML_OK)],
      [`${BASE}/view-application.adoc`, ok(VIEW_APP)],
      [`${BASE}/view-development.adoc`, http(404)],
      [`${BASE}/security.adoc`, ok(VIEW_SEC)],
    ]);

    await expect(fetchTemplateAndViews(BASE, { fetchImpl: fetchMock })).rejects.toBeInstanceOf(
      ViewFetchError
    );

    try {
      await fetchTemplateAndViews(BASE, { fetchImpl: fetchMock });
      throw new Error("unreachable");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ViewFetchError);
      expect(e.failures).toHaveLength(1);
      expect(e.failures[0].file).toBe("view-development.adoc");
      expect(e.failures[0].status).toBe(404);
    }
  });

  it("returns partial success when a view fails and strict=false", async () => {
    const fetchMock = buildFetchMock([
      [METADATA_URL, ok(YAML_OK)],
      [`${BASE}/view-application.adoc`, ok(VIEW_APP)],
      [`${BASE}/view-development.adoc`, http(500)],
      [`${BASE}/security.adoc`, ok(VIEW_SEC)],
    ]);

    const res = await fetchTemplateAndViews(BASE, {
      fetchImpl: fetchMock,
      strict: false,
      concurrency: 3,
    });

    // Only 2 succeeded
    expect(res.views.map(v => v.file).sort()).toEqual(
      ["security.adoc", "view-application.adoc"].sort()
    );
  });
 

  it("handles empty metadata file gracefully (error)", async () => {
    const fetchMock = buildFetchMock([[METADATA_URL, ok("   \n  ")]]);
    await expect(
      fetchTemplateAndViews(BASE, { fetchImpl: fetchMock })
    ).rejects.toThrow(/Empty template-metadata\.yaml/);
  });
});
