import type { PartFetchFailure } from "./PartFetchFailure.js";

export class PartFetchError extends Error {
  public readonly failures: PartFetchFailure[];

  constructor(failures: PartFetchFailure[]) {
    super(
      `Failed to fetch ${failures.length} part file(s): ` +
        failures.map(f => `${f.name} (${f.file}) [${f.status ?? "?"}]`).join(", ")
    );
    this.name = "PartFetchError";
    this.failures = failures;
  }
}
