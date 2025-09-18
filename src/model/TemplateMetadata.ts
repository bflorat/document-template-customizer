import type { TemplateLabelDefinition } from "./TemplateLabelDefinition.js";
import type { Part } from "./Part.js";

export interface TemplateMetadata {
  author: string;
  license: string;
  parts: Part[];
  labels?: TemplateLabelDefinition[];
}
