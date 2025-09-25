import type { TemplateLabelDefinition } from "./TemplateLabelDefinition";
import type { Part } from "./Part";

export interface TemplateMetadata {
  author: string;
  license: string;
  parts: Part[];
  labels?: TemplateLabelDefinition[];
  language?: string; // BCP-47 or 2-letter code (e.g., 'en', 'fr')
}
