import type { PartFetchFailure } from "./PartFetchFailure.js";

export class PartFetchError extends Error {
  public readonly failures: PartFetchFailure[];

  constructor(failures: PartFetchFailure[]) {
    super(
      `Failed to fetch ${failures.length} part file(s): ` +
        failures
          .map(f => {
            const status = f.status ?? "?";
            const details = f.message ? `: ${f.message}` : "";
            return `${f.name} (${f.file}) [${status}]${details}`;
          })
          .join(", ")
    );
    this.name = "PartFetchError";
    this.failures = failures;
  }
}
