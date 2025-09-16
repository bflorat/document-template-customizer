import type { TemplateMetadata } from "./TemplateMetadata.js";

export interface TemplateFetchResult {
  url: string;
  raw: string;
  data: TemplateMetadata;
}
