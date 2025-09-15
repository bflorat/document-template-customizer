import type { TemplateFetchResult } from "./TemplateFetchResult";
import type { View } from "./View";

export interface TemplateWithViews {
  metadata: TemplateFetchResult;
  views: Required<Pick<View, "name" | "file" | "url" | "content" | "sections">>[];
}
