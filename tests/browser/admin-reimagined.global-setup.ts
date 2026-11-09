import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

/**
 * ADMIN-RE-05: the reimagined admin suites run on local Alpha, which is seeded
 * on the classic admin. Switch it to 'reimagined' for the run, then put the
 * previous value back. The owner's first visit also confirms the club's time
 * zone from the browser (ADMIN-RE-02's automatic set), which the RE-01 database
 * test expects to be unset, so the time zone and its confirmation are put back
 * too. Rows the run adds, audit rows included, are removed by
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

type AlphaAdminSettings = { admin_portal: string; time_zone: string; time_zone_set_at: Date | null };

async function readAlpha(): Promise<AlphaAdminSettings> {
  return withClient(async (db) => {
    const result = await db.query<AlphaAdminSettings>(
      "select admin_portal, time_zone, time_zone_set_at from onzio.clubs where id=$1",
      [CLUB_IDS.alpha],
    );
    if (result.rowCount !== 1) throw new Error("Local Alpha club not found.");
    return result.rows[0];
  });
}

async function writeAlpha(settings: AlphaAdminSettings) {
  await withClient((db) =>
    db.query("update onzio.clubs set admin_portal=$2, time_zone=$3, time_zone_set_at=$4 where id=$1", [
      CLUB_IDS.alpha,
      settings.admin_portal,
      settings.time_zone,
      settings.time_zone_set_at,
    ]),
  );
}

export default async function globalSetup() {
  const previous = await readAlpha();
  await writeAlpha({ ...previous, admin_portal: "reimagined" });
  return async () => {
    await writeAlpha(previous);
  };
}
