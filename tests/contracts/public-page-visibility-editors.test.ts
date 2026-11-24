import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubContext } from "@/lib/club-context";
import {
  PAGE_HIDDEN_BANNER, PUBLIC_PAGE_KEYS, ROBINSON_HIDDEN_NOTE, VISIBLE_TO_VISITORS_LABEL, type PublicPageKey, type PublicPageVisibility,
} from "@/lib/public-page-visibility";

// Owners and admins of a cinematic@2 club can hide Robinson Stadium, Chick-fil-A, Foothill Transit, Single match tickets and
// Season ticket membership from visitors.
// The "Visible to visitors" switch sits at the top of each editor, saves on its own, and leaves the content draft alone.
const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/public-page-visibility-editor", () => ({ savePublicPageVisibility: save }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => createElement("a", props) }));

import { ClubContextProvider } from "@/components/ClubContextProvider";
import { PublicPageVisibilityProvider } from "@/components/PublicPageVisibilityProvider";
import { PageVisibilityControl } from "@/components/admin/stadium/PageVisibilityControl";
import { changePageVisibility } from "@/components/admin/stadium/page-visibility-change";

const source = (path: string) => readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const EDITORS = [
  { name: "Robinson Stadium", key: "stadium", file: "components/admin/stadium/RobinsonStadiumEditor.tsx", route: "app/admin/(protected)/stadium/page.tsx" },
  { name: "Chick-fil-A", key: "chick-fil-a", file: "components/admin/chick-fil-a/ChickFilAEditor.tsx", route: "app/admin/(protected)/chick-fil-a/page.tsx" },
  { name: "Foothill Transit", key: "foothill-transit", file: "components/admin/stadium/StadiumEditor.tsx", route: "app/admin/(protected)/foothill-transit/page.tsx" },
  { name: "Tickets (single match tickets)", key: "tickets", file: "components/admin/tickets/TicketsEditor.tsx", route: "app/admin/(protected)/tickets/page.tsx" },
  // Season Ticket Membership shares TicketPageEditor with Know Before You Go, so the control is mounted there and switched on by a prop.
  { name: "Season Ticket Membership", key: "season-membership", file: "components/admin/ticket-pages/TicketPageEditor.tsx", route: "app/admin/(protected)/season-membership/page.tsx" },
] as const satisfies readonly { name: string; key: PublicPageKey; file: string; route: string }[];
/** The editors that mount the control themselves, with the key written at the mount. */
const DIRECT_EDITORS = EDITORS.filter(editor => editor.key !== "season-membership");
const SEASON_EDITOR = "components/admin/ticket-pages/SeasonMembershipEditor.tsx";
const KNOW_BEFORE_YOU_GO_EDITOR = "components/admin/ticket-pages/KnowBeforeYouGoEditor.tsx";
const TICKET_PAGE_EDITOR = "components/admin/ticket-pages/TicketPageEditor.tsx";

// The map is not part of ClubContext (the 2026-08-14 outage): the admin layout reads it separately and provides it.
// No map given means no provider, which is how an editor preview, or a failed read, looks: every page shown.
function render(pageKey: PublicPageKey, visibility?: PublicPageVisibility, note?: string, slug = "any-club") {
  const club = { id: "club-1", slug, presentationTemplateKey: "cinematic@2" } as unknown as ClubContext;
  const control = createElement(PageVisibilityControl, { pageKey, note });
  const children = visibility === undefined ? control : createElement(PublicPageVisibilityProvider, { visibility, children: control });
  return renderToStaticMarkup(createElement(ClubContextProvider, { club, children }));
}
const switchTag = (markup: string) => markup.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? "";

beforeEach(() => save.mockReset());

describe("the five pages the switch covers", () => {
  it("are Robinson Stadium, Chick-fil-A, Foothill Transit, Single match tickets and Season ticket membership", () => {
    expect([...PUBLIC_PAGE_KEYS].sort()).toEqual(EDITORS.map(editor => editor.key).sort());
  });
});

describe.each(EDITORS)("$name editor's Visible to visitors switch", ({ key }) => {
  it("renders one switch labelled Visible to visitors, on by default when there is no map", () => {
    for (const map of [undefined, {}]) {
      const markup = render(key, map);
      expect(markup.match(/role="switch"/g)).toHaveLength(1);
      const tag = switchTag(markup);
      expect(tag).toContain(`aria-label="${VISIBLE_TO_VISITORS_LABEL}"`);
      expect(tag).toContain('aria-checked="true"');
      expect(markup).not.toContain(PAGE_HIDDEN_BANNER);
    }
  });

  it("is on for every club, with no club named in the logic (Rose City included)", () => {
    expect(switchTag(render(key, undefined, undefined, "rose-city"))).toContain('aria-checked="true"');
    expect(switchTag(render(key, { [key]: true }, undefined, "rose-city"))).toContain('aria-checked="true"');
  });

  it("is off with the hidden banner when the map says false, and the switch is still usable", () => {
    const markup = render(key, { [key]: false });
    const tag = switchTag(markup);
    expect(tag).toContain('aria-checked="false"');
    expect(tag).not.toContain("aria-disabled");
    expect(markup).toContain(PAGE_HIDDEN_BANNER);
    expect(markup).toContain(VISIBLE_TO_VISITORS_LABEL);
  });

  it("keeps the banner above the switch", () => {
    const markup = render(key, { [key]: false });
    expect(markup.indexOf(PAGE_HIDDEN_BANNER)).toBeGreaterThan(-1);
    expect(markup.indexOf(PAGE_HIDDEN_BANNER)).toBeLessThan(markup.indexOf('role="switch"'));
  });

  it("is not affected by another page being hidden", () => {
    const other = PUBLIC_PAGE_KEYS.find(candidate => candidate !== key)!;
    const markup = render(key, { [other]: false });
    expect(switchTag(markup)).toContain('aria-checked="true"');
    expect(markup).not.toContain(PAGE_HIDDEN_BANNER);
  });

  it("shows no Robinson note unless one is passed", () => {
    expect(render(key, { [key]: false })).not.toContain(ROBINSON_HIDDEN_NOTE);
  });
});

describe("the Tickets-menu pages' switches", () => {
  it("are independent of each other and of the stadium pages", () => {
    expect(switchTag(render("tickets", { "season-membership": false }))).toContain('aria-checked="true"');
    expect(switchTag(render("season-membership", { tickets: false }))).toContain('aria-checked="true"');
    expect(render("tickets", { "season-membership": false, stadium: false })).not.toContain(PAGE_HIDDEN_BANNER);
    expect(render("season-membership", { tickets: false, stadium: false })).not.toContain(PAGE_HIDDEN_BANNER);
    expect(switchTag(render("tickets", { tickets: false }))).toContain('aria-checked="false"');
    expect(switchTag(render("season-membership", { "season-membership": false }))).toContain('aria-checked="false"');
    expect(switchTag(render("stadium", { tickets: false, "season-membership": false }))).toContain('aria-checked="true"');
  });

  it("carry the same label, the same banner and no extra note as the other pages", () => {
    for (const key of ["tickets", "season-membership"] as const) {
      const markup = render(key, { [key]: false });
      expect(markup).toContain(`>${VISIBLE_TO_VISITORS_LABEL}<`);
      expect(markup).toContain(PAGE_HIDDEN_BANNER);
      expect(markup).not.toContain("data-page-visibility-note");
      expect(markup).toContain(`data-page-visibility-page="${key}"`);
    }
  });
});

describe("Robinson Stadium editor's parking and footer note", () => {
  it("explains what else disappears with the page, whether the page is shown or hidden", () => {
    for (const map of [undefined, { stadium: false }]) {
      const markup = render("stadium", map, ROBINSON_HIDDEN_NOTE);
      expect(markup).toContain("Stadium parking");
      expect(markup).toContain("footer");
      expect(markup).toContain("Guidelines, the fan code and media credentials stay visible");
      expect(markup).toContain(ROBINSON_HIDDEN_NOTE);
    }
  });

  it("ties the note to the switch for screen readers", () => {
    const markup = render("stadium", { stadium: false }, ROBINSON_HIDDEN_NOTE);
    const describedBy = switchTag(markup).match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(markup).toContain(`id="${describedBy}"`);
  });
});

describe("toggling the switch", () => {
  it.each(EDITORS)("$name saves its own key with the new value and shows the server's answer", async ({ key }) => {
    save.mockResolvedValue({ ok: true, visibility: { [key]: false } });
    await expect(changePageVisibility(key, false, true)).resolves.toEqual({ visible: false, failure: null });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(key, false);

    save.mockResolvedValue({ ok: true, visibility: { [key]: true } });
    await expect(changePageVisibility(key, true, false)).resolves.toEqual({ visible: true, failure: null });
    expect(save).toHaveBeenLastCalledWith(key, true);
  });

  it.each(["tickets", "season-membership"] as const)("shows the existing notice and snaps %s back when the database does not know the page yet (migration not applied)", async key => {
    // The real helper against a route that answers INVALID_PUBLIC_PAGE_VISIBILITY, the way the RPC does before the migration lands.
    const actual = await vi.importActual<typeof import("@/lib/public-page-visibility-editor")>("@/lib/public-page-visibility-editor");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "INVALID_PUBLIC_PAGE_VISIBILITY" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      save.mockImplementation(actual.savePublicPageVisibility);
      await expect(changePageVisibility(key, false, true)).resolves.toEqual({ visible: true, failure: "Couldn't change who can see this page. Try again." });
      await expect(changePageVisibility(key, true, false)).resolves.toEqual({ visible: false, failure: "Couldn't change who can see this page. Try again." });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/public-page-visibility", expect.objectContaining({ body: JSON.stringify({ page: key, visible: false }) }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("follows the server's map, not the click, when they differ", async () => {
    save.mockResolvedValue({ ok: true, visibility: { stadium: true } });
    await expect(changePageVisibility("stadium", false, true)).resolves.toEqual({ visible: true, failure: null });
  });

  it.each(EDITORS)("$name reverts to the previous value and returns the message when saving fails", async ({ key }) => {
    save.mockResolvedValue({ ok: false, message: "Couldn't change who can see this page. Try again." });
    await expect(changePageVisibility(key, false, true)).resolves.toEqual({ visible: true, failure: "Couldn't change who can see this page. Try again." });
    await expect(changePageVisibility(key, true, false)).resolves.toEqual({ visible: false, failure: "Couldn't change who can see this page. Try again." });
  });
});

describe("how each editor uses the switch", () => {
  const control = source("components/admin/stadium/PageVisibilityControl.tsx");

  it.each(DIRECT_EDITORS)("$name renders the shared control with its own key in the page header notice slot", ({ key, file }) => {
    const editor = source(file);
    expect(editor).toMatch(/import \{ PageVisibilityControl \} from "[^"]*PageVisibilityControl"/);
    expect(editor).toMatch(new RegExp(`notice=\\{<><PageVisibilityControl pageKey="${key}"[^>]*/>\\{notice\\}</>\\}`));
    expect(editor.match(/<PageVisibilityControl /g)).toHaveLength(1);
  });

  it("mounts Season Ticket Membership's control once, in the shared ticket-page editor's notice slot, switched on by the Season editor only", () => {
    const shared = source(TICKET_PAGE_EDITOR);
    expect(shared).toMatch(/import \{ PageVisibilityControl \} from "[^"]*PageVisibilityControl"/);
    expect(shared).toMatch(/notice=\{visibilityKey \? <><PageVisibilityControl pageKey=\{visibilityKey\} \/>\{notice\}<\/> : notice\}/);
    expect(shared.match(/<PageVisibilityControl /g)).toHaveLength(1);
    expect(source(SEASON_EDITOR)).toMatch(/<TicketPageEditor [^>]*visibilityKey="season-membership"/);
    expect(source(SEASON_EDITOR)).not.toContain("PageVisibilityControl");
  });

  it("gives Know Before You Go no switch: that page always stays visible", () => {
    const editor = source(KNOW_BEFORE_YOU_GO_EDITOR);
    expect(editor).not.toMatch(/PageVisibilityControl|visibilityKey|pageVisible|publicPageVisibility/);
    expect(PUBLIC_PAGE_KEYS as readonly string[]).not.toContain("know-before-you-go");
  });

  it("passes the parking and footer note on Robinson only", () => {
    expect(source(EDITORS[0].file)).toMatch(/<PageVisibilityControl pageKey="stadium" note=\{ROBINSON_HIDDEN_NOTE\} \/>/);
    for (const editor of EDITORS.slice(1)) expect(source(editor.file), editor.name).not.toContain("ROBINSON_HIDDEN_NOTE");
  });

  it.each(EDITORS)("$name keeps the setting out of the content draft, Save, Discard and the unsaved guard", ({ file }) => {
    const editor = source(file);
    const element = editor.match(/<PageVisibilityControl [^>]*\/>/)?.[0] ?? "";
    expect(element).not.toMatch(/locked|dirty|draft|onChange|change=|patch/);
    expect(editor).not.toMatch(/pageVisible|publicPageVisibility|savePublicPageVisibility/);
  });

  it("saves on its own through the visibility endpoint helper and is disabled while a request is in flight", () => {
    expect(control).toContain("changePageVisibility(pageKey, next, previous)");
    expect(control).toContain("disabled={saving}");
    expect(control).toContain("usePublicPageVisibility()");
    expect(control).toContain("pageVisible({ publicPageVisibility: visibility }, pageKey)");
    expect(control).not.toMatch(/pageVisible\(club,/);
    expect(control).toContain("VISIBLE_TO_VISITORS_LABEL");
    expect(control).toContain("PAGE_HIDDEN_BANNER");
    expect(control).toMatch(/failure && <EditorNotice failed>/);
  });

  it("never touches the content save, draft or unsaved-changes machinery", () => {
    expect(control).not.toMatch(/useSaveState|useUnsavedGuard|useUnsaved|setDraft|dirty|saveVisitorPageEditor|localStorage/);
  });

  it("hardcodes no club slug", () => {
    expect(control).not.toMatch(/rose-city|diverse|academy@|cinematic@/i);
    expect(source("components/admin/stadium/page-visibility-change.ts")).not.toMatch(/rose-city|diverse|slug/i);
  });

  it.each(EDITORS)("$name stays reachable at its admin route while the page is hidden", ({ route }) => {
    const page = source(route);
    expect(page).not.toMatch(/pageVisible|publicPageVisibility|notFound|redirect/);
  });
});
