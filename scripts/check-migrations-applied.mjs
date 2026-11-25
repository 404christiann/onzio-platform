// Production migration gate (CLAUDE.md): every migration in the branch must already be applied to production.
// Read-only: it only compares lists.
//   node scripts/check-migrations-applied.mjs --changes < `git diff --no-renames --name-status -z <base> HEAD -- supabase/migrations`
//     fails when the pull request edits or deletes an existing migration; prints changed=true|false.
//   node scripts/check-migrations-applied.mjs < `supabase migration list --linked --output-format json`
//     fails when the branch has a migration production does not.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const NOT_APPLIED_MESSAGE = "apply to prod first (needs christian's go), then re-run";
export const EDITED_MESSAGE =
  "an existing migration was edited or deleted; migrations are immutable once merged, add a new migration instead";

/** @param {unknown} list */
export function compareMigrations(list) {
  const migrations = /** @type {{ migrations?: unknown }} */ (list)?.migrations;
  if (!Array.isArray(migrations)) throw new Error("migration list output has no migrations array");
  const localOnly = migrations.filter((m) => m.local && !m.remote).map((m) => m.local);
  const remoteOnly = migrations.filter((m) => m.remote && !m.local).map((m) => m.remote);
  return { localOnly, remoteOnly };
}

/**
 * Classifies `git diff --no-renames --name-status -z` output (status NUL path NUL, paths never quoted) for
 * supabase/migrations. Anything else (a quoted or tab-joined line, a path outside the directory, a missing
 * path) throws, so a name git rendered differently can never slip past as "no change".
 * @param {string} nameStatus
 */
export function classifyMigrationChanges(nameStatus) {
  const added = [];
  const edited = [];
  const fields = nameStatus.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 2 !== 0) throw new Error(`unparseable diff output: ${JSON.stringify(nameStatus)}`);
  for (let index = 0; index < fields.length; index += 2) {
    const [status, path] = [fields[index], fields[index + 1]];
    if (!/^[ACDMTUXB]$/.test(status) || !path.startsWith("supabase/migrations/")) {
      throw new Error(`unparseable diff entry: ${JSON.stringify(`${status}\0${path}`)}`);
    }
    if (status === "A") added.push(path);
    else edited.push(`${status} ${path}`);
  }
  return { added, edited };
}

function checkChanges() {
  const { added, edited } = classifyMigrationChanges(readFileSync(0, "utf8"));
  for (const path of added) console.log(`Added: ${path}`);
  if (edited.length > 0) {
    for (const entry of edited) console.log(`Edited or deleted: ${entry}`);
    console.log(`::error title=Existing migration changed::${EDITED_MESSAGE}`);
    console.error(EDITED_MESSAGE);
    process.exit(1);
  }
  console.log(`changed=${added.length > 0}`);
}

function checkApplied() {
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv[2] === "--changes") checkChanges();
  else checkApplied();
}
