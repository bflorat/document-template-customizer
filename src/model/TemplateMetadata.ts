import type { TemplateLabelDefinition } from "./TemplateLabelDefinition";
import type { Part } from "./Part";

export interface TemplateMetadata {
  author: string;
  license: string;
  parts: Part[];
  labels?: TemplateLabelDefinition[];
  language?: string; // BCP-47 or 2-letter code (e.g., 'en', 'fr')
  // Optional list of additional files (relative to README.adoc location)
  // to import into the generated blank template (kept folder structure)
  files_imported_into_blank_templates?: string[];
  // Optional base directory (relative to README.adoc) from which listed files are resolved.
  // When set, each listed file path is preserved relative to this base in the blank template.
  files_imports_base_dir?: string;
  // Preferred form: list of import groups, each with a base_dir and files.
  // base_dir is mandatory, relative to README.adoc; files are relative to base_dir.
  files_imports?: Array<{ base_dir: string; files: string[] }>;
}
