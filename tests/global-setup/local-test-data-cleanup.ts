import { recordLocalTestDataStart, removeLocalTestDataAddedSince, type LocalTestDataStart } from "../helpers/local-test-data-cleanup";

// Vitest global setup: only database runs (`npm run test:db` sets SUPABASE_LOCAL=1) touch the database.
let before: LocalTestDataStart | null = null;

export async function setup() {
  if (process.env.SUPABASE_LOCAL !== "1") return;
  before = await recordLocalTestDataStart();
}

export async function teardown() {
  await removeLocalTestDataAddedSince(before);
}
