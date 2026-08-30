import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

let clients: LocalClients;
let originalAlphaState: {
  draft_document_id: string | null;
  published_document_id: string | null;
  updated_by: string;
} | null = null;
let versionCounter = Math.floor(Date.now() % 1_000_000);

function nextPresentationVersion() {
  versionCounter += 1;
  return 90_000_000 + versionCounter;
}

function presentationConfiguration(templateId: "cinematic" | "heritage" | "clubhouse") {
  return {
    schemaVersion: 1,
    template: { id: templateId, version: 1 },
    fontPack:
      templateId === "cinematic"
        ? "bebas-inter"
        : templateId === "heritage"
          ? "archivo-sora"
          : "geist",
    theme: {
      surface: {
        canvas: "#07120D",
        elevated: "#102219",
        subtle: "#172820",
        inverse: "#F7F3E8",
      },
      text: {
        primary: "#F7F3E8",
        secondary: "#DDE7DF",
        muted: "#B8C3BB",
        inverse: "#07120D",
      },
      action: {
        primary: "#12A140",
        primaryHover: "#0E8334",
        primaryText: "#FFFFFF",
        secondary: "#E7001B",
      },
      border: { subtle: "#2A3B31", strong: "#F7F3E8" },
      status: {
        success: "#12A140",
        warning: "#D69E2E",
        danger: "#D14343",
      },
    },
    modules: { roster: true, schedule: true, store: true },
    homepage: {
      sections: [
        {
          id: "hero-main",
          type:
            templateId === "cinematic"
              ? "cinematic.hero"
              : templateId === "heritage"
                ? "heritage.identity"
                : "clubhouse.hero",
          enabled: true,
          emptyBehavior: "error",
          config: {},
        },
      ],
    },
    navigation: {
      groups: [{ id: "main", label: null, routes: ["home", "roster", "schedule"] }],
    },
    metadata: {
      recommendationId: null,
      createdBy: USER_IDS.ownerAal2,
      createdAt: "2026-07-29T00:00:00.000Z",
      sourceArtifact: null,
    },
  };
}

beforeAll(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
  const state = await clients.service
    .from("presentation_state")
    .select("draft_document_id, published_document_id, updated_by")
    .eq("club_id", CLUB_IDS.alpha)
    .maybeSingle();
  expect(state.error?.message).toBeUndefined();
  originalAlphaState = state.data;
});

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

afterEach(async () => {
  if (!originalAlphaState) return;
  const restored = await clients.service.from("presentation_state").upsert({
    club_id: CLUB_IDS.alpha,
    ...originalAlphaState,
  });
  expect(restored.error?.message).toBeUndefined();
});

describe("Phase 9.3 presentation persistence and RLS", () => {
  it("exposes immutable presentation tables with service-role write access", async () => {
    const version = nextPresentationVersion();
    const insert = await clients.service.from("presentation_documents").insert({
      club_id: CLUB_IDS.alpha,
      version,
      schema_version: 1,
      template_id: "cinematic",
      template_version: 1,
      configuration: presentationConfiguration("cinematic"),
      configuration_digest:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      created_by: USER_IDS.ownerAal2,
    });
    expect(insert.error?.message).toBeUndefined();

    const duplicateUpdate = await clients.service
      .from("presentation_documents")
      .update({ template_id: "heritage" })
      .eq("club_id", CLUB_IDS.alpha)
      .eq("version", version);
    expect(duplicateUpdate.error?.message).toMatch(/immutable/i);
  });

  it("persists the registered clubhouse template as a published presentation document", async () => {
    const version = nextPresentationVersion();
    const insert = await clients.service
      .from("presentation_documents")
      .insert({
        club_id: CLUB_IDS.alpha,
        version,
        schema_version: 1,
        template_id: "clubhouse",
        template_version: 1,
        configuration: presentationConfiguration("clubhouse"),
        configuration_digest:
          "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        created_by: USER_IDS.ownerAal2,
      })
      .select("id, template_id, template_version")
      .single();
    expect(insert.error?.message).toBeUndefined();

    const state = await clients.service.from("presentation_state").upsert({
      club_id: CLUB_IDS.alpha,
      published_document_id: insert.data!.id,
      updated_by: USER_IDS.ownerAal2,
    });
    expect(state.error?.message).toBeUndefined();

    const anonRead = await clients.anon
      .from("presentation_documents")
      .select("id, template_id, template_version")
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", insert.data!.id)
      .single();

    expect(anonRead.error?.message).toBeUndefined();
    expect(anonRead.data).toEqual({
      id: insert.data!.id,
      template_id: "clubhouse",
      template_version: 1,
    });
  });

  it("allows anonymous users to read only the current published document for a live club", async () => {
    const draftVersion = nextPresentationVersion();
    const publishedVersion = nextPresentationVersion();
    const draft = await clients.service
      .from("presentation_documents")
      .insert({
        club_id: CLUB_IDS.alpha,
        version: draftVersion,
        schema_version: 1,
        template_id: "cinematic",
        template_version: 1,
        configuration: presentationConfiguration("cinematic"),
        configuration_digest:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        created_by: USER_IDS.ownerAal2,
      })
      .select("id")
      .single();
    expect(draft.error?.message).toBeUndefined();

    const published = await clients.service
      .from("presentation_documents")
      .insert({
        club_id: CLUB_IDS.alpha,
        version: publishedVersion,
        schema_version: 1,
        template_id: "cinematic",
        template_version: 1,
        configuration: presentationConfiguration("cinematic"),
        configuration_digest:
          "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        created_by: USER_IDS.ownerAal2,
      })
      .select("id")
      .single();
    expect(published.error?.message).toBeUndefined();

    const state = await clients.service.from("presentation_state").upsert({
      club_id: CLUB_IDS.alpha,
      draft_document_id: draft.data!.id,
      published_document_id: published.data!.id,
      updated_by: USER_IDS.ownerAal2,
    });
    expect(state.error?.message).toBeUndefined();

    const { data, error } = await clients.anon
      .from("presentation_documents")
      .select("id, version")
      .eq("club_id", CLUB_IDS.alpha)
      .order("version");
    expect(error?.message).toBeUndefined();
    expect(data).toContainEqual({ id: published.data!.id, version: publishedVersion });
    expect(data).not.toContainEqual({ id: draft.data!.id, version: draftVersion });
  });

  it("rejects cross-tenant presentation pointers and preserves publication history", async () => {
    const version = nextPresentationVersion();
    const alpha = await clients.service
      .from("presentation_documents")
      .insert({
        club_id: CLUB_IDS.alpha,
        version,
        schema_version: 1,
        template_id: "cinematic",
        template_version: 1,
        configuration: presentationConfiguration("cinematic"),
        configuration_digest:
          "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        created_by: USER_IDS.ownerAal2,
      })
      .select("id")
      .single();
    expect(alpha.error?.message).toBeUndefined();

    const crossTenant = await clients.service.from("presentation_state").upsert({
      club_id: CLUB_IDS.bravo,
      published_document_id: alpha.data!.id,
      updated_by: USER_IDS.ownerAal2,
    });
    expect(crossTenant.error?.message).toMatch(/foreign key/i);

    const publication = await clients.service.from("presentation_publications").insert({
      club_id: CLUB_IDS.alpha,
      action: "publish",
      previous_document_id: null,
      next_document_id: alpha.data!.id,
      next_configuration_digest:
        "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      validation_result: { valid: true, errors: [], warnings: [] },
      override_reason: null,
      created_by: USER_IDS.ownerAal2,
    });
    expect(publication.error?.message).toBeUndefined();

    const deletion = await clients.service
      .from("presentation_publications")
      .delete()
      .eq("club_id", CLUB_IDS.alpha);
    expect(deletion.error?.message).toMatch(/permission denied/i);
  });
});
