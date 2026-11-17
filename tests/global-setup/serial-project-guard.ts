import type { TestProject } from "vitest/node";

// Command-line flags such as --fileParallelism and --isolate=false override
// every project. The database and pilot files share fixtures outside their
// own process, so refuse to start instead of racing.
export function setup(project: TestProject) {
  if (project.config.maxWorkers !== 1 || project.config.isolate !== true) {
    throw new Error(
      `The "${project.name}" project must run one isolated file at a time. ` +
        "Remove --fileParallelism and --isolate=false from the command.",
    );
  }
}
