import type { TemplateLabelDefinition } from "./TemplateLabelDefinition";
import type { Part } from "./Part";

export interface TemplateMetadata {
  author: string;
  license: string;
  parts: Part[];
  labels?: TemplateLabelDefinition[];
}
