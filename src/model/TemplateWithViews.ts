import type { TemplateFetchResult } from "./TemplateFetchResult.js";
import type { View } from "./View.js";

export interface TemplateWithViews {
  metadata: TemplateFetchResult;
  views: Required<Pick<View, "name" | "file" | "url" | "content" | "sections">>[];
}
