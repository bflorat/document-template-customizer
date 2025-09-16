import type { TemplateLabelDefinition } from "./TemplateLabelDefinition.js";
import type { View } from "./View.js";

export interface TemplateMetadata {
  author: string;
  license: string;
  views: View[];
  labels?: TemplateLabelDefinition[];
}
