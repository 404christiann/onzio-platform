import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import { createFreshLocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

// Database contracts for onzio.tryouts_page_content, added in
// 20260809120000_tryouts_page_content.sql.
//
// The table holds the two /tryouts hero paragraphs that used to be string
// literals in components/AcademyTryoutsPage.tsx. These cover the boundary the
// migration owns: an untouched club renders the template defaults, a club can
// only manage its own copy, the public can only read it for a club whose site
// is actually readable, and both documented CHECK ceilings are real.

let clients: LocalClients;
const cleanups: Array<() => Promise<void>> = [];

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const MISSING_TABLE = "PGRST205";

async function clearRows() {
  await clients.service
    .from("tryouts_page_content")
    .delete()
    .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
}

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
  await clearRows();
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
  await clearRows();
});

describe("onzio.tryouts_page_content schema", () => {
  it("exposes the table", async () => {
    const { error } = await clients.service
      .from("tryouts_page_content")
      .select("*")
      .limit(0);
    expect(error?.code).not.toBe(MISSING_TABLE);
    expect(error?.message).toBeUndefined();
  });

  it("defaults both paragraphs to empty so an untouched club renders the template", async () => {
    const { error: insertError } = await clients.service
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.alpha });
    expect(insertError?.message).toBeUndefined();

    const { data, error } = await clients.service
      .from("tryouts_page_content")
      .select("intro_with_tryouts, intro_no_tryouts")
      .eq("club_id", CLUB_IDS.alpha)
      .single();
    expect(error?.message).toBeUndefined();
    expect(data).toEqual({ intro_with_tryouts: "", intro_no_tryouts: "" });
  });

  it("holds exactly one row per club", async () => {
    await clients.service
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.alpha });
    const { error } = await clients.service
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.alpha });
    expect(error?.code, "the tryouts page copy is a per-club singleton").toBe(
      "23505",
    );
  });

  it.each([
    ["intro_with_tryouts", 320],
    ["intro_no_tryouts", 320],
  ] as const)("caps %s at %i characters", async (column, maximum) => {
    const atLimit = await clients.service
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.alpha, [column]: "x".repeat(maximum) });
    expect(atLimit.error?.message).toBeUndefined();

    const overLimit = await clients.service
      .from("tryouts_page_content")
      .update({ [column]: "x".repeat(maximum + 1) })
      .eq("club_id", CLUB_IDS.alpha);
    expectPostgrestError(overLimit.error, CHECK_VIOLATION, `${column} ceiling`);
  });

  it("persists edited copy and surfaces it as the public page's own values", async () => {
    const { resolveTryoutsPageContent, DEFAULT_TRYOUTS_PAGE_CONTENT } =
      await import("@/lib/tryouts-page-content");
    const edited = {
      club_id: CLUB_IDS.alpha,
      intro_with_tryouts: "Alpha FC runs open evaluations every spring.",
    };
    const write = await clients.service
      .from("tryouts_page_content")
      .insert(edited);
    expect(write.error?.message).toBeUndefined();

    // Read back the way the public site does: anonymous, tenant-scoped.
    const { data, error } = await clients.anon
      .from("tryouts_page_content")
      .select("*")
      .eq("club_id", CLUB_IDS.alpha)
      .single();
    expect(error?.message).toBeUndefined();

    const content = resolveTryoutsPageContent(data);
    expect(content.introWithTryouts).toBe(edited.intro_with_tryouts);
    // The untouched paragraph still resolves to the approved wording rather
    // than rendering blank.
    expect(content.introNoTryouts).toBe(
      DEFAULT_TRYOUTS_PAGE_CONTENT.introNoTryouts,
    );
  });
});

describe("onzio.tryouts_page_content authorization", () => {
  it("denies an anonymous write", async () => {
    const { error } = await clients.anon
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.alpha });
    expectPostgrestError(
      error,
      PERMISSION_DENIED,
      "anonymous tryouts_page_content insert",
    );
  });

  it("exposes the copy publicly for a live club", async () => {
    await clients.service
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.alpha });

    const { data, error } = await clients.anon
      .from("tryouts_page_content")
      .select("club_id")
      .eq("club_id", CLUB_IDS.alpha);
    expect(error?.message).toBeUndefined();
    expect(data).toEqual([{ club_id: CLUB_IDS.alpha }]);
  });

  it("hides the copy from the public for a preview club", async () => {
    await clients.service
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.bravo });

    const { data, error } = await clients.anon
      .from("tryouts_page_content")
      .select("club_id")
      .eq("club_id", CLUB_IDS.bravo);
    expect(error?.message).toBeUndefined();
    expect(
      data ?? [],
      "a club that is not publicly accessible must expose no content rows",
    ).toEqual([]);
  });

  it("lets a club member manage only its own club's copy", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal2@alpha.local",
      userId: USER_IDS.ownerAal2,
    });
    cleanups.push(session.cleanup);

    const allowed = await session.client
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.alpha, intro_no_tryouts: "Coming soon." });
    expect(allowed.error?.message).toBeUndefined();

    const crossClub = await session.client
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.bravo });
    expectPostgrestError(
      crossClub.error,
      PERMISSION_DENIED,
      "cross-club tryouts_page_content insert",
    );

    // A foreign delete must leave the other club's row untouched.
    await clients.service
      .from("tryouts_page_content")
      .insert({ club_id: CLUB_IDS.bravo });
    await session.client
      .from("tryouts_page_content")
      .delete()
      .eq("club_id", CLUB_IDS.bravo);
    const { data: survivors } = await clients.service
      .from("tryouts_page_content")
      .select("club_id")
      .eq("club_id", CLUB_IDS.bravo);
    expect(
      survivors ?? [],
      "another club's content row must survive a foreign delete attempt",
    ).toEqual([{ club_id: CLUB_IDS.bravo }]);
  });
});
