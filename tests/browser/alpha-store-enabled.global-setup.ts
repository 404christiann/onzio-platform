import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

/**
 * Browser suites that open the Shop editor, the homepage kit block or the
 * "Edit in Shop" shortcut stand in for Diverse City, whose Shop switch is on.
 * Since PR #87 every one of those surfaces follows `clubs.store_enabled`, and
 * the seeded local Alpha club has it off (the 2026-08-12 backfill ran before
 * the seed), so these suites turn it on for their run and restore the
 * previous value afterwards. Loopback only.
 */
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

async function setStoreEnabled(value: boolean) {
  const db = new Client(config);
  await db.connect();
  try {
    const result = await db.query<{ store_enabled: boolean }>(
      "update onzio.clubs c set store_enabled=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.store_enabled",
      [CLUB_IDS.alpha, value],
    );
    if (result.rowCount !== 1) throw new Error("Local Alpha club not found.");
    return result.rows[0].store_enabled;
  } finally {
    await db.end();
  }
}

export default async function globalSetup() {
  const previous = await setStoreEnabled(true);
  return async () => {
    await setStoreEnabled(previous);
  };
}
