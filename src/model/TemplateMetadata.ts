import type { View } from "./View";

export interface TemplateLabelDefinition {
  name: string;
  available_values?: string[];
}

export interface TemplateMetadata {
  author: string;
  license: string;
  views: View[];
  labels?: TemplateLabelDefinition[];
}
