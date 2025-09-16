import type { ViewSectionMetadata } from "./ViewSectionMetadata.js";

export interface ViewSection {
  level: number;
  title: string;
  children: ViewSection[];
  metadata?: ViewSectionMetadata;
}
