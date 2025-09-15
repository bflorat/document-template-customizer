export interface ViewSectionMetadata {
  id?: string;
  labels?: string[];
  links?: string[];
  raw?: Record<string, unknown>;
}

export interface ViewSection {
  level: number;
  title: string;
  children: ViewSection[];
  metadata?: ViewSectionMetadata;
}
