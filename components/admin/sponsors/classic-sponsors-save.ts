import type { DBSiteSponsorLogo, SponsorLogoPlacement } from "@/lib/db-types";
import { sponsorLimitMessage, type DraftSponsorLogo, type SponsorLogoDiff } from "@/lib/sponsor-content";

export type SponsorEditorLogo = DraftSponsorLogo & { key: string };

export type SponsorSaveAttempt = {
  placement: SponsorLogoPlacement;
  version: number;
  logos: SponsorEditorLogo[];
  originalIds: Set<string>;
  changes: SponsorLogoDiff;
  deleted: boolean;
  updates: number;
  inserted: DBSiteSponsorLogo[] | null;
  insertUncertain: boolean;
  retireUrls: string[];
  retired: boolean;
};

type WriteResult = { error: { message: string } | null; data?: unknown };
type SponsorWriter = {
  remove: (ids: string[]) => PromiseLike<WriteResult>;
  update: (id: string, changes: SponsorLogoDiff["toUpdate"][number]["changes"]) => PromiseLike<WriteResult>;
  insert: (rows: SponsorLogoDiff["toInsert"]) => PromiseLike<WriteResult>;
  read: () => Promise<DBSiteSponsorLogo[]>;
  retire: (urls: string[]) => Promise<void>;
};

export function confirmSponsorInserts(attempt: SponsorSaveAttempt, rows: DBSiteSponsorLogo[]) {
  const candidates = rows.filter((row) => !attempt.originalIds.has(row.id));
  const matched = attempt.changes.toInsert.map((insert) => candidates.filter((row) =>
    row.logo_url === insert.logo_url && row.name === insert.name &&
    row.sort_order === insert.sort_order &&
    row.show_on_homepage === insert.show_on_homepage && row.show_in_footer === insert.show_in_footer,
  ));
  if (matched.some((rows) => rows.length !== 1)) return false;
  attempt.inserted = matched.map(([row]) => row);
  attempt.insertUncertain = false;
  return true;
}

export async function persistSponsorAttempt(attempt: SponsorSaveAttempt, writer: SponsorWriter) {
  if (attempt.insertUncertain && !confirmSponsorInserts(attempt, await writer.read())) {
    throw new Error("The previous save has not been confirmed. Reload this page to review saved sponsor logos before saving again.");
  }
  if (!attempt.deleted && attempt.changes.toDelete.length > 0) {
    const result = await writer.remove(attempt.changes.toDelete.map((row) => row.id));
    if (result.error) throw new Error(result.error.message);
    attempt.deleted = true;
  }
  while (attempt.updates < attempt.changes.toUpdate.length) {
    const update = attempt.changes.toUpdate[attempt.updates];
    const result = await writer.update(update.id, update.changes);
    if (result.error) throw new Error(sponsorLimitMessage(result.error.message) ?? result.error.message);
    attempt.updates += 1;
  }
  if (attempt.inserted === null && attempt.changes.toInsert.length > 0) {
    let result: WriteResult;
    try {
      result = await writer.insert(attempt.changes.toInsert);
    } catch (error) {
      attempt.insertUncertain = true;
      throw error;
    }
    if (result.error) throw new Error(sponsorLimitMessage(result.error.message) ?? result.error.message);
    if (!Array.isArray(result.data) || !confirmSponsorInserts(attempt, result.data as DBSiteSponsorLogo[])) {
      attempt.insertUncertain = true;
      throw new Error("The saved sponsor logos could not be confirmed. Try again.");
    }
  }
  if (!attempt.retired) {
    await writer.retire(attempt.retireUrls);
    attempt.retired = true;
  }
  return writer.read();
}

export function reconcileSponsorDraft(
  current: SponsorEditorLogo[],
  attempt: SponsorSaveAttempt,
) {
  const insertedByKey = new Map(attempt.logos.filter((logo) => logo.id === null)
    .map((logo, index) => [logo.key, attempt.inserted?.[index]?.id]));
  return current.map((logo) => {
    const id = insertedByKey.get(logo.key);
    return id ? { ...logo, id } : logo;
  });
}
