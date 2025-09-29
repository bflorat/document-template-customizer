export class TemplateManifestNotFoundError extends Error {
  public readonly attemptedUrl: string;
  public readonly status?: number;

  constructor(attemptedUrl: string, status?: number) {
    super(
      status
        ? `base-template-manifest.yaml not found at ${attemptedUrl} (HTTP ${status}).`
        : `base-template-manifest.yaml not found at ${attemptedUrl}.`
    );
    this.name = "TemplateManifestNotFoundError";
    this.attemptedUrl = attemptedUrl;
    this.status = status;
  }
}
