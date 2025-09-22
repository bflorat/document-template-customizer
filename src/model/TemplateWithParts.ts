import type { TemplateFetchResult } from "./TemplateFetchResult";
import type { Part } from "./Part";

export interface TemplateWithParts {
  metadata: TemplateFetchResult;
  parts: Required<Pick<Part, "name" | "file" | "url" | "content" | "sections">>[];
  readme: { file: string; content: string };
}
