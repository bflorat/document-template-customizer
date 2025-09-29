import type { TemplateManifest } from "./TemplateManifest";

export interface TemplateFetchResult {
  url: string;
  raw: string;
  data: TemplateManifest;
}
