import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

const ALPHA_FORM_ID = "77777777-7777-4777-8777-777777777701";
const BRAVO_FORM_ID = "77777777-7777-4777-8777-777777777702";
const PROGRAM_ID = "77777777-7777-4777-8777-777777777711";
const TRYOUT_ID = "77777777-7777-4777-8777-777777777721";
const FOREIGN_KEY_VIOLATION = "23503";

let clients: LocalClients;

async function removeFixtures() {
  await clients.service.from("tryouts").delete().eq("id", TRYOUT_ID);
  await clients.service.from("programs").delete().eq("id", PROGRAM_ID);
  await clients.service
    .from("registration_forms")
    .delete()
    .in("id", [ALPHA_FORM_ID, BRAVO_FORM_ID]);
}

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
  await removeFixtures();

  const forms = await clients.service.from("registration_forms").insert([
    {
      id: ALPHA_FORM_ID,
      club_id: CLUB_IDS.alpha,
      slug: "program-tryout-link-alpha",
      title: "Alpha registration",
      status: "draft",
    },
    {
      id: BRAVO_FORM_ID,
      club_id: CLUB_IDS.bravo,
      slug: "program-tryout-link-bravo",
      title: "Bravo registration",
      status: "draft",
    },
  ]);
  expect(forms.error?.message).toBeUndefined();

  const program = await clients.service.from("programs").insert({
    id: PROGRAM_ID,
    club_id: CLUB_IDS.alpha,
    slug: "native-registration-link-program",
    display_title: "Native registration link program",
  });
  expect(program.error?.message).toBeUndefined();

  const tryout = await clients.service.from("tryouts").insert({
    id: TRYOUT_ID,
    club_id: CLUB_IDS.alpha,
    headline: "Native registration link tryout",
  });
  expect(tryout.error?.message).toBeUndefined();
});

afterEach(async () => {
  await removeFixtures();
});

describe("native registration links for programs and tryouts", () => {
  it("defaults both opt-in references to null", async () => {
    const [program, tryout] = await Promise.all([
      clients.service
        .from("programs")
        .select("registration_form_id")
        .eq("id", PROGRAM_ID)
        .single(),
      clients.service
        .from("tryouts")
        .select("registration_form_id")
        .eq("id", TRYOUT_ID)
        .single(),
    ]);
    expect(program.error?.message).toBeUndefined();
    expect(tryout.error?.message).toBeUndefined();
    expect(program.data?.registration_form_id).toBeNull();
    expect(tryout.data?.registration_form_id).toBeNull();
  });

  it("accepts same-club form references for both surfaces", async () => {
    const [program, tryout] = await Promise.all([
      clients.service
        .from("programs")
        .update({ registration_form_id: ALPHA_FORM_ID })
        .eq("id", PROGRAM_ID),
      clients.service
        .from("tryouts")
        .update({ registration_form_id: ALPHA_FORM_ID })
        .eq("id", TRYOUT_ID),
    ]);
    expect(program.error?.message).toBeUndefined();
    expect(tryout.error?.message).toBeUndefined();
  });

  it("rejects cross-tenant references for programs and tryouts", async () => {
    const program = await clients.service
      .from("programs")
      .update({ registration_form_id: BRAVO_FORM_ID })
      .eq("id", PROGRAM_ID);
    expectPostgrestError(
      program.error,
      FOREIGN_KEY_VIOLATION,
      "cross-tenant program registration form",
    );

    const tryout = await clients.service
      .from("tryouts")
      .update({ registration_form_id: BRAVO_FORM_ID })
      .eq("id", TRYOUT_ID);
    expectPostgrestError(
      tryout.error,
      FOREIGN_KEY_VIOLATION,
      "cross-tenant tryout registration form",
    );
  });

  it("requires an admin to detach a linked form before deleting it", async () => {
    const link = await clients.service
      .from("programs")
      .update({ registration_form_id: ALPHA_FORM_ID })
      .eq("id", PROGRAM_ID);
    expect(link.error?.message).toBeUndefined();

    const deletion = await clients.service
      .from("registration_forms")
      .delete()
      .eq("id", ALPHA_FORM_ID);
    expectPostgrestError(
      deletion.error,
      FOREIGN_KEY_VIOLATION,
      "linked registration form deletion",
    );
  });
});
