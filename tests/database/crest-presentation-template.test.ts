import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

// Database contract for 20260818120000_crest_presentation_template.sql.
//
// The migration is schema-only: it widens the presentation_documents
// template_id allowlist to admit 'crest'. What matters is that the allowlist
// is still an allowlist -- registering a new template must not have quietly
// turned the constraint into a free-text column -- and that no previously
// registered template was dropped on the way through.

let clients: LocalClients;
const CHECK_VIOLATION = "23514";

const REGISTERED_TEMPLATES = [
  "cinematic",
  "heritage",
  "clubhouse",
  "academy",
  "editorial",
  "pathway",
  "crest",
] as const;

let version = 900_000 + Math.floor(Math.random() * 50_000);

function nextVersion() {
  version += 1;
  return version;
}

const createdDocumentIds: string[] = [];

function presentationDocument(templateId: string) {
  return {
    club_id: CLUB_IDS.alpha,
    version: nextVersion(),
    schema_version: 1,
    template_id: templateId,
    template_version: 1,
    configuration: { sections: [] },
    configuration_digest: "c".repeat(64),
    created_by: USER_IDS.ownerAal2,
  };
}

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

afterEach(async () => {
  while (createdDocumentIds.length > 0) {
    const id = createdDocumentIds.pop()!;
    await clients.service.from("presentation_documents").delete().eq("id", id);
  }
});

describe("onzio.presentation_documents template registry", () => {
  it("accepts crest@1 as a presentation template", async () => {
    const { data, error } = await clients.service
      .from("presentation_documents")
      .insert(presentationDocument("crest"))
      .select("id, template_id, template_version")
      .single();
    expect(error?.message).toBeUndefined();
    createdDocumentIds.push(data!.id);
    expect(data!.template_id).toBe("crest");
    expect(data!.template_version).toBe(1);
  });

  it.each(REGISTERED_TEMPLATES)(
    "still accepts the previously registered %s template",
    async (templateId) => {
      const { data, error } = await clients.service
        .from("presentation_documents")
        .insert(presentationDocument(templateId))
        .select("id")
        .single();
      expect(
        error?.message,
        `registering crest must not have dropped ${templateId}`,
      ).toBeUndefined();
      createdDocumentIds.push(data!.id);
    },
  );

  it.each(["crest@1", "Crest", "cv-united", ""])(
    "still rejects %o as a template_id",
    async (templateId) => {
      const { error } = await clients.service
        .from("presentation_documents")
        .insert(presentationDocument(templateId));
      expectPostgrestError(
        error,
        CHECK_VIOLATION,
        `unregistered template_id ${templateId}`,
      );
    },
  );
});
