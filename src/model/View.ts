import type { ViewSection } from "./ViewSection";

export interface View {
  name: string;
  file: string;
  url?: string;
  content?: string;
  sections?: ViewSection[];
}
