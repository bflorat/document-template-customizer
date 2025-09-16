export interface ViewFetchFailure {
  name: string;
  file: string;
  url: string;
  status?: number;
  message: string;
}
