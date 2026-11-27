import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { starterCinematicContactContent } from "@/lib/cinematic-contact-content";
import { emptyTicketsContent } from "@/lib/tickets-content";

/**
 * The server refuses script, data and protocol-relative links on its own, so a
 * request that skips the admin form (posted straight to the save route) never
 * reaches a session, the database or an RPC.
 */
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-assets", () => ({ resolveMediaReferences: async (rows: unknown[]) => rows }));

const UNSAFE = ["javascript:alert(1)", "JavaScript:alert(1)", "  JaVaScRiPt:alert(1)", "\tjavascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "//evil.example.com"];

const post = (path: string, body: unknown) => new Request(`https://alpha.example${path}`, {
  method: "POST", headers: { host: "alpha.example", origin: "https://alpha.example", "content-type": "application/json" }, body: JSON.stringify(body),
});

const ROUTES: ReadonlyArray<readonly [name: string, load: () => Promise<{ POST: (request: Request) => Promise<Response> }>, path: string, body: (href: string) => unknown]> = [
  ["Contact informationHref", () => import("@/app/api/admin/cinematic-contact/route"), "/api/admin/cinematic-contact",
    (href) => ({ operationId: randomUUID(), expectedRevision: "1", designRevision: "d", content: { ...starterCinematicContactContent(), informationHref: href } })],
  ["Tickets purchaseUrl", () => import("@/app/api/admin/tickets-editor/route"), "/api/admin/tickets-editor",
    (href) => ({ operationId: randomUUID(), expectedRevision: "0", designRevision: "d", content: { ...emptyTicketsContent(), purchaseUrl: href }, retiredMediaAssetIds: [] })],
  ["Sponsor website_url", () => import("@/app/api/admin/data/route"), "/api/admin/data",
    (href) => ({ table: "site_sponsor_logos", operation: "update", payload: { website_url: href }, filters: [{ kind: "eq", column: "id", value: randomUUID() }] })],
  ["Social link href", () => import("@/app/api/admin/data/route"), "/api/admin/data",
    (href) => ({ table: "site_social_links", operation: "upsert", payload: { id: "instagram", label: "Instagram", href, icon: "/icons/instagram.svg", sort_order: 0 } })],
  ["Match sponsor_link", () => import("@/app/api/admin/data/route"), "/api/admin/data",
    (href) => ({ table: "matches", operation: "update", payload: { sponsor_link: href }, filters: [{ kind: "eq", column: "id", value: randomUUID() }] })],
  ["Program external_cta_href", () => import("@/app/api/admin/data/route"), "/api/admin/data",
    (href) => ({ table: "programs", operation: "update", payload: { external_cta_href: href }, filters: [{ kind: "eq", column: "id", value: randomUUID() }] })],
  ["Tryout registration_href", () => import("@/app/api/admin/data/route"), "/api/admin/data",
    (href) => ({ table: "tryouts", operation: "update", payload: { registration_href: href }, filters: [{ kind: "eq", column: "id", value: randomUUID() }] })],
  ["Any other *_url column", () => import("@/app/api/admin/data/route"), "/api/admin/data",
    (href) => ({ table: "matches", operation: "update", payload: { opponent_logo_url: href }, filters: [{ kind: "eq", column: "id", value: randomUUID() }] })],
];

beforeEach(() => vi.clearAllMocks());

describe("save routes reject unsafe links without the admin form", () => {
  describe.each(ROUTES)("%s", (_name, load, path, body) => {
    it.each(UNSAFE)("rejects %j with 400 before any session or database call", async (href) => {
      const { POST } = await load();
      const response = await POST(post(path, body(href)));
      expect(response.status).toBe(400);
      expect(mocks.createClient).not.toHaveBeenCalled();
    });
  });
});
