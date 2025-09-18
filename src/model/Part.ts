import type { PartSection } from "./PartSection.js";

export interface Part {
  name: string;
  file: string;
  url?: string;
  content?: string;
  sections?: PartSection[];
}
