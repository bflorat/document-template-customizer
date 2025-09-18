export interface PartFetchFailure {
  name: string;
  file: string;
  url: string;
  status?: number;
  message: string;
}
