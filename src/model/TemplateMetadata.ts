import type { TemplateLabelDefinition } from "./TemplateLabelDefinition";
import type { View } from "./View";

export interface TemplateMetadata {
  author: string;
  license: string;
  views: View[];
  labels?: TemplateLabelDefinition[];
}
