import type { TemplateMetadata } from "./TemplateMetadata";

export interface TemplateFetchResult {
  url: string;
  raw: string;
  data: TemplateMetadata;
}
