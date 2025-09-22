import type { PartSection } from "./PartSection";

export interface Part {
  name: string;
  file: string;
  url?: string;
  content?: string;
  sections?: PartSection[];
}
