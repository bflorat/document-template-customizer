import type { TemplateFetchResult } from "./TemplateFetchResult.js";
import type { Part } from "./Part.js";

export interface TemplateWithParts {
  metadata: TemplateFetchResult;
  parts: Required<Pick<Part, "name" | "file" | "url" | "content" | "sections">>[];
}
