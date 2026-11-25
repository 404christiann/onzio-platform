// Production migration gate (CLAUDE.md): every migration in the branch must already be applied to production.
// Reads `supabase migration list --linked --output-format json` on stdin and fails when the branch has a migration
// production does not. Read-only: it only compares the two lists.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const NOT_APPLIED_MESSAGE = "apply to prod first (needs christian's go), then re-run";

/** @param {unknown} list */
export function compareMigrations(list) {
  const migrations = /** @type {{ migrations?: unknown }} */ (list)?.migrations;
  if (!Array.isArray(migrations)) throw new Error("migration list output has no migrations array");
  const localOnly = migrations.filter((m) => m.local && !m.remote).map((m) => m.local);
  const remoteOnly = migrations.filter((m) => m.remote && !m.local).map((m) => m.remote);
  return { localOnly, remoteOnly };
}

function main() {
  const { localOnly, remoteOnly } = compareMigrations(JSON.parse(readFileSync(0, "utf8")));
  for (const version of remoteOnly) {
    console.log(`::warning title=Branch is behind production::${version} is applied to production but not in this branch; rebase onto main.`);
  }
  if (localOnly.length > 0) {
    console.log(`Not applied to production: ${localOnly.join(", ")}`);
    console.log(`::error title=Migration not applied to production::${NOT_APPLIED_MESSAGE}`);
    console.error(NOT_APPLIED_MESSAGE);
    process.exit(1);
  }
  console.log("Every migration in this branch is applied to production.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
