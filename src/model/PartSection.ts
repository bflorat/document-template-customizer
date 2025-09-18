import type { PartSectionMetadata } from "./PartSectionMetadata.js";

export interface PartSection {
  level: number;
  title: string;
  children: PartSection[];
  metadata?: PartSectionMetadata;
}
