import type { ViewFetchFailure } from "./ViewFetchFailure";

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
