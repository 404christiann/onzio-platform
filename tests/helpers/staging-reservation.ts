import { Client } from "pg";
import { localPostgresConfig } from "./local-postgres";

// RC-ADMIN-10c: the staging INSERT policy needs a live reservation for the exact path, as
// /api/admin/media/authorize records through onzio.reserve_media_upload. Tests that stage as a
// club member write that row directly (no quota or rate check, so repeated runs never hit the
// hourly limit) and delete it afterwards.

export type ReservationState = { consumed?: boolean; expired?: boolean; clubId?: string };

/** Records a reservation for `<club>/<surface>/<uuid>.<ext>` and returns a cleanup that deletes it. */
export async function reserveStagingPath(path: string, actorId: string, state: ReservationState = {}) {
  const [pathClub, surface, file] = path.split("/");
  const id = file.replace(/\.[a-z]+$/, "");
  const clubId = state.clubId ?? pathClub;
  const db = new Client(localPostgresConfig());
  await db.connect();
  try {
    await db.query(
      `insert into onzio_private.media_upload_reservations
         (id, club_id, actor_id, surface, kind, staging_path, claimed_size, issued_at, expires_at, consumed_at, outcome)
       values ($1, $2, $3, $4, 'photo', $5, 1000,
         now() - case when $7 then interval '10 minutes' else interval '0' end,
         now() + case when $7 then interval '-5 minutes' else interval '5 minutes' end,
         case when $6 then now() end, case when $6 then 'consumed' end)`,
      [id, clubId, actorId, surface, state.clubId ? `${clubId}/${surface}/${file}` : path, state.consumed ?? false, state.expired ?? false],
    );
  } finally {
    await db.end();
  }
  return async () => {
    const cleanup = new Client(localPostgresConfig());
    await cleanup.connect();
    try {
      await cleanup.query("delete from onzio_private.media_upload_reservations where id = $1", [id]);
    } finally {
      await cleanup.end();
    }
  };
}

/** Marks a reservation used, as finalize does. */
export async function consumeStagingReservation(path: string) {
  const db = new Client(localPostgresConfig());
  await db.connect();
  try {
    await db.query(
      "update onzio_private.media_upload_reservations set consumed_at = now(), outcome = 'consumed' where staging_path = $1",
      [path],
    );
  } finally {
    await db.end();
  }
}
