import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTicketsContent, hydrateTicketsContent, ticketsContentSchema, ticketsDraftFingerprint, TICKET_VISIBILITY_KEYS, type TicketVisibilityKey } from "@/lib/tickets-content";
import { hydrateTicketPage, seasonMembershipSchema } from "@/lib/cinematic-ticket-pages-content";
import { seasonMembershipReferenceContent } from "@/lib/ticket-pages-reference-content";

// RC-ADMIN-07: optional show/hide flags. Absent = shown; a section hides only on an explicit false.
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "tenant", name: "Rose City FC" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: null }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: vi.fn() }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
import CinematicTickets from "@/components/cinematic/CinematicTickets";
import CinematicSeasonMembership from "@/components/cinematic/CinematicSeasonMembership";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test"));
afterEach(() => vi.unstubAllEnvs());

const rose = () => JSON.parse(readFileSync("assets/rose-city-tickets-2027/copy.json", "utf8")) as ReturnType<typeof emptyTicketsContent>;
const MARKER: Record<TicketVisibilityKey, string> = { perksVisible: "perks-title", includesVisible: "tickets-includes", transitVisible: "transit-title", directionsVisible: "tickets-directions", purchaseVisible: "tickets-buy" };
function ticketsHtml(flags: Partial<Record<TicketVisibilityKey, boolean | undefined>>) {
  const content = { ...rose(), ...flags };
  return renderToStaticMarkup(createElement(CinematicTickets, { content: hydrateTicketsContent(content, [], false) }));
}

describe("Tickets visibility flags (zod)", () => {
  it("keeps the seeded Rose City payload valid with every flag absent, and does not inject any", () => {
    const parsed = ticketsContentSchema.parse(rose());
    for (const key of TICKET_VISIBILITY_KEYS) expect(key in parsed).toBe(false);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(ticketsContentSchema.parse(parsed)));
    expect(ticketsDraftFingerprint(rose())).toBe(JSON.stringify(rose()));
    for (const key of TICKET_VISIBILITY_KEYS) expect(key in emptyTicketsContent()).toBe(false);
  });
  it.each(TICKET_VISIBILITY_KEYS)("%s round-trips true and false, drops an undefined value from the JSON and rejects non-booleans", key => {
    for (const value of [true, false]) expect(ticketsContentSchema.parse({ ...rose(), [key]: value })[key]).toBe(value);
    expect(JSON.stringify({ ...rose(), [key]: undefined })).toBe(JSON.stringify(rose()));
    for (const bad of ["false", 0, null]) expect(ticketsContentSchema.safeParse({ ...rose(), [key]: bad }).success).toBe(false);
  });
  it("still rejects unknown keys", () => { expect(ticketsContentSchema.safeParse({ ...rose(), perksHidden: true }).success).toBe(false); });
});

describe("Tickets page hides a section only on an explicit false", () => {
  it.each(TICKET_VISIBILITY_KEYS)("%s: absent and true show the section, false hides it", key => {
    const marker = MARKER[key];
    expect(ticketsHtml({})).toContain(marker);
    expect(ticketsHtml({ [key]: true })).toContain(marker);
    expect(ticketsHtml({ [key]: undefined })).toContain(marker);
    expect(ticketsHtml({ [key]: false })).not.toContain(marker);
  });
  it("hiding one section leaves the others", () => {
    const html = ticketsHtml({ perksVisible: false });
    for (const key of TICKET_VISIBILITY_KEYS.filter(k => k !== "perksVisible")) expect(html).toContain(MARKER[key]);
  });
});

describe("Season Membership visibility flags", () => {
  const base = () => structuredClone(seasonMembershipReferenceContent);
  const part = ["heading", "intro", "button"] as const;
  it("keeps the reference payload valid with the flags absent and never injects them", () => {
    const parsed = seasonMembershipSchema.parse(base());
    for (const key of part) expect("visible" in parsed[key]).toBe(false);
  });
  it.each(part)("%s.visible round-trips true and false, rejects non-booleans and unknown sibling keys", key => {
    for (const value of [true, false]) { const c = base(); (c[key] as { visible?: boolean }).visible = value; expect(seasonMembershipSchema.parse(c)[key]).toHaveProperty("visible", value); }
    const bad = base(); (bad[key] as Record<string, unknown>).visible = "no"; expect(seasonMembershipSchema.safeParse(bad).success).toBe(false);
    const unknown = base(); (unknown[key] as Record<string, unknown>).hidden = true; expect(seasonMembershipSchema.safeParse(unknown).success).toBe(false);
  });
  const html = (change: (c: ReturnType<typeof base>) => void) => { const c = base(); change(c); return renderToStaticMarkup(createElement(CinematicSeasonMembership, { content: hydrateTicketPage("season-membership", c, []) })); };
  it("hides the heading, the intro and the buy buttons only on explicit false", () => {
    const shown = html(() => {});
    expect(shown).toContain("tp-heading"); expect(shown).toContain("tp-copy"); expect(shown).toContain("tp-buy");
    expect(html(c => { (c.heading as { visible?: boolean }).visible = true; (c.intro as { visible?: boolean }).visible = true; (c.button as { visible?: boolean }).visible = true; })).toBe(shown);
    expect(html(c => { (c.heading as { visible?: boolean }).visible = false; })).not.toContain("tp-heading");
    expect(html(c => { (c.intro as { visible?: boolean }).visible = false; })).not.toContain("tp-copy");
    const noButton = html(c => { (c.button as { visible?: boolean }).visible = false; });
    expect(noButton).not.toContain("tp-buy"); expect(noButton).toContain("tp-heading"); expect(noButton).toContain("tp-pricing");
  });
});
