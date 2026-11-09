import type { FullConfig } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

/**
 * ADMIN-RE-02: the owner's first visit to /admin confirms the club's time zone
 * from the browser (AdminPortalProvider posts to /api/admin/club-time-zone),
 * which stamps local Alpha's `time_zone_set_at`. The RE-01 database test
 * expects it unset, so every browser suite that signs the Alpha owner into the
 * admin puts the time zone and its confirmation back when the run ends.
 * Does nothing unless the suite's base URL is a loopback or `*.localhost`
 * address; the database it touches is always the loopback one.
 */
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

type AlphaTimeZone = { time_zone: string; time_zone_set_at: Date | null };

function isLocal(baseURL: string | undefined) {
  if (!baseURL) return false;
  try {
    const host = new URL(baseURL).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  } catch { return false; }
}

async function withClient<T>(action: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client(config);
  await db.connect();
  try {
    return await action(db);
  } finally {
    await db.end();
  }
}

export default async function globalSetup(playwright: FullConfig) {
  if (!isLocal(playwright.projects[0]?.use.baseURL)) return;
  const previous = await withClient(async (db) => {
    const result = await db.query<AlphaTimeZone>("select time_zone, time_zone_set_at from onzio.clubs where id=$1", [CLUB_IDS.alpha]);
    if (result.rowCount !== 1) throw new Error("Local Alpha club not found.");
    return result.rows[0];
  });
  return async () => {
    await withClient((db) =>
      db.query("update onzio.clubs set time_zone=$2, time_zone_set_at=$3 where id=$1", [
        CLUB_IDS.alpha,
        previous.time_zone,
        previous.time_zone_set_at,
      ]),
    );
  };
}
