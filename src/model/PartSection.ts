import type { PartSectionMetadata } from "./PartSectionMetadata";

export interface PartSection {
  level: number;
  title: string;
  children: PartSection[];
  metadata?: PartSectionMetadata;
}
