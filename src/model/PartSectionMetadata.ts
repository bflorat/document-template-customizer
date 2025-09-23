export interface PartSectionMetadata {
  id?: string;
  labels?: string[];
  linkTo?: string[];
  // If true, keep this section's body content in the blank template
  keepContent?: boolean;
  raw?: Record<string, unknown>;
}
