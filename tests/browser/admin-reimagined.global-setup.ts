import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

/**
 * ADMIN-RE-05: the reimagined admin suites run on local Alpha, which is seeded
 * on the classic admin. Switch it to 'reimagined' for the run, then put the
 * previous value back. The time zone the owner's first visit confirms is put
 * back by alpha-time-zone.global-setup.ts, and rows the run adds, audit rows
 * included, are removed by local-test-data-cleanup.global-setup.ts, both listed
 * after this one. Loopback only.
 */
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

async function setAdminPortal(value: string) {
  const db = new Client(config);
  await db.connect();
  try {
    const result = await db.query<{ admin_portal: string }>(
      "update onzio.clubs c set admin_portal=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.admin_portal",
      [CLUB_IDS.alpha, value],
    );
    if (result.rowCount !== 1) throw new Error("Local Alpha club not found.");
    return result.rows[0].admin_portal;
  } finally {
    await db.end();
  }
}

export default async function globalSetup() {
  const previous = await setAdminPortal("reimagined");
  return async () => {
    await setAdminPortal(previous);
  };
}
