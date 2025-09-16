import type { ViewSection } from "./ViewSection.js";

export interface View {
  name: string;
  file: string;
  url?: string;
  content?: string;
  sections?: ViewSection[];
}
