export class TemplateMetadataNotFoundError extends Error {
  public readonly attemptedUrl: string;
  public readonly status?: number;

  constructor(attemptedUrl: string, status?: number) {
    super(
      status
        ? `template-metadata.yaml not found at ${attemptedUrl} (HTTP ${status}).`
        : `template-metadata.yaml not found at ${attemptedUrl}.`
    );
    this.name = "TemplateMetadataNotFoundError";
    this.attemptedUrl = attemptedUrl;
    this.status = status;
  }
}

export interface ViewFetchFailure {
  name: string;
  file: string;
  url: string;
  status?: number;
  message: string;
}

export class ViewFetchError extends Error {
  public readonly failures: ViewFetchFailure[];

  constructor(failures: ViewFetchFailure[]) {
    super(
      `Failed to fetch ${failures.length} view file(s): ` +
        failures.map(f => `${f.name} (${f.file}) [${f.status ?? "?"}]`).join(", ")
    );
    this.name = "ViewFetchError";
    this.failures = failures;
  }
}
