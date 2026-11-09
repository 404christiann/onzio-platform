import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

/**
 * ADMIN-RE-05: the reimagined admin suites run on local Alpha, which is seeded
 * on the classic admin. Switch it to 'reimagined' for the run, then put the
 * previous value back. Rows the run adds, audit rows included, are removed by
 * local-test-data-cleanup.global-setup.ts, listed after this one. Loopback only.
 */
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

async function withClient<T>(action: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client(config);
  await db.connect();
  try {
    return await action(db);
  } finally {
    await db.end();
  }
}

async function setAdminPortal(value: string): Promise<string> {
  return withClient(async (db) => {
    const result = await db.query<{ admin_portal: string }>(
      "update onzio.clubs c set admin_portal=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.admin_portal",
      [CLUB_IDS.alpha, value],
    );
    if (result.rowCount !== 1) throw new Error("Local Alpha club not found.");
    return result.rows[0].admin_portal;
  });
}

export default async function globalSetup() {
  const previous = await setAdminPortal("reimagined");
  return async () => {
    await setAdminPortal(previous);
  };
}
