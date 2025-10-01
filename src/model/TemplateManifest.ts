import type { TemplateLabelDefinition } from "./TemplateLabelDefinition";
import type { Part } from "./Part";

export interface TemplateManifest {
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
  // Preferred form: list of import groups using explicit source and destination dirs.
  // - src_dir: mandatory, relative to README.adoc; files paths are relative to src_dir.
  // - dest_dir: optional, destination subfolder inside the zip ('' or '.' means root of target: blank-template/ or template/)
  files_imports?: Array<{ src_dir: string; dest_dir: string; files: string[] }>;
  // Preferred form for the resulting templates (full templates)
  files_imports_templates?: Array<{ src_dir: string; dest_dir: string; files: string[] }>;
}
