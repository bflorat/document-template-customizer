export class TemplateMetadataNotFoundError extends Error {
  public readonly attemptedUrl: string;
  public readonly status?: number;

  constructor(attemptedUrl: string, status?: number) {
    super(
      status
        ? `base-template-metadata.yaml not found at ${attemptedUrl} (HTTP ${status}).`
        : `base-template-metadata.yaml not found at ${attemptedUrl}.`
    );
    this.name = "TemplateMetadataNotFoundError";
    this.attemptedUrl = attemptedUrl;
    this.status = status;
  }
}
