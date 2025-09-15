export interface ViewSectionMetadata {
  id?: string;
  labels?: string[];
  linkTo?: string[];
  raw?: Record<string, unknown>;
}

export interface ViewSection {
  level: number;
  title: string;
  children: ViewSection[];
  metadata?: ViewSectionMetadata;
}
