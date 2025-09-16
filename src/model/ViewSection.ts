import type { ViewSectionMetadata } from "./ViewSectionMetadata";

export interface ViewSection {
  level: number;
  title: string;
  children: ViewSection[];
  metadata?: ViewSectionMetadata;
}
