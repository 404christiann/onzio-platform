import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RC-MATCH-AREA: after the server's read of a match fails, "Try again" must fetch it in the browser and show it. A
// click needs a client renderer, and this suite has no DOM, so the three hooks the page uses (useState, useRef,
// useEffect) are replaced by a small runtime that keeps their slots between renders, compares effect dependencies the
// way React does, and re-renders after a state change. The page, its handler and its effect are the real ones.
const rt = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: unknown }>,
  index: 0,
  pending: [] as Array<() => void>,
  dirty: false,
  club: { id: "11111111-1111-4111-8111-111111111111", name: "Rose City FC" },
  fixture: vi.fn(),
  identity: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const slot = (rt.slots[rt.index] ??= { value: typeof initial === "function" ? (initial as () => unknown)() : initial });
      rt.index += 1;
      return [slot.value, (next: unknown) => {
        const value = typeof next === "function" ? (next as (previous: unknown) => unknown)(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; rt.dirty = true; }
      }];
    },
    useRef: (initial: unknown) => { const slot = (rt.slots[rt.index] ??= { current: initial }); rt.index += 1; return slot; },
    useEffect: (effect: () => unknown, deps?: readonly unknown[]) => {
      const slot = (rt.slots[rt.index] ??= {});
      rt.index += 1;
      const changed = !slot.deps || !deps || deps.some((dep, i) => !Object.is(dep, slot.deps![i]));
      if (changed) rt.pending.push(() => { if (typeof slot.cleanup === "function") slot.cleanup(); slot.deps = deps; slot.cleanup = effect(); });
    },
  };
});
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => rt.club }));
vi.mock("@/components/ClubTimeZoneProvider", () => ({ useClubTimeZone: () => "America/Los_Angeles" }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/lib/queries", () => ({ fetchFixtureById: rt.fixture }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: rt.identity }));
vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");
  return { default: (props: { href: string; children?: ReactNode }) => h("a", { href: props.href }, props.children) };
});
vi.mock("@/components/cinematic/CinematicMatchSummary", async () => {
  const { createElement: h } = await import("react");
  return { default: (props: { fixture: { opponent: string }; clubLabel: string }) => h("div", { "data-summary": "" }, `${props.clubLabel}|${props.fixture.opponent}`) };
});
import CinematicMatchSummaryPage, { type CinematicMatchSummaryInitial } from "@/components/cinematic/CinematicMatchSummaryPage";

const FIXTURE_ID = "baf199e2-bea4-5fc7-840f-e1dc59fefb4d";
const match = { id: FIXTURE_ID, date: "2027-05-02", time: "19:45:00", opponent: "Ocelot FC", home: true, roseCityScore: 2, opponentScore: 1 };

/** Renders the page, runs its effects, and re-renders while a state change is waiting, as React would. */
function mount(initial?: CinematicMatchSummaryInitial) {
  rt.slots.length = 0;
  rt.pending.length = 0;
  rt.dirty = false;
  let tree: ReactElement;
  const render = () => {
    do {
      rt.dirty = false;
      rt.index = 0;
      tree = CinematicMatchSummaryPage({ fixtureId: FIXTURE_ID, initial }) as ReactElement;
      for (const effect of rt.pending.splice(0)) effect();
    } while (rt.dirty);
  };
  render();
  const find = (node: unknown, type: string): ReactElement<{ onClick?: () => void }> | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const child of node) { const found = find(child, type); if (found) return found; } return null; }
    const element = node as ReactElement<{ children?: ReactNode }>;
    return element.type === type ? (element as never) : find(element.props?.children, type);
  };
  return {
    html: () => renderToStaticMarkup(tree),
    button: () => find(tree, "button"),
    click() { const button = find(tree, "button"); expect(button, "a Try again button").not.toBeNull(); button!.props.onClick?.(); render(); },
    /** Lets the browser fetches resolve, then renders what they set. */
    async settle() { await new Promise((resolve) => setTimeout(resolve, 0)); render(); },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rt.fixture.mockResolvedValue(match);
  rt.identity.mockResolvedValue({ initials: "RCFC" });
});

describe("Try again after a failed server read of a match", () => {
  it("shows the alert and the button, and fetches nothing on its own", async () => {
    const page = mount({ data: null, failed: true });
    await page.settle();
    expect(page.html()).toContain("This match summary is temporarily unavailable.");
    expect(page.html()).toContain("Try again");
    expect(rt.fixture).not.toHaveBeenCalled();
    expect(rt.identity).not.toHaveBeenCalled();
  });

  it("fetches the match and the club label in the browser when clicked, then shows the match", async () => {
    const page = mount({ data: null, failed: true });
    page.click();
    expect(rt.fixture).toHaveBeenCalledTimes(1);
    expect(rt.fixture).toHaveBeenCalledWith(FIXTURE_ID, rt.club.id);
    expect(rt.identity).toHaveBeenCalledWith(rt.club.id);
    expect(page.html()).toContain("Loading match…");
    expect(page.html()).not.toContain("temporarily unavailable");
    await page.settle();
    expect(page.html()).toContain("RCFC|Ocelot FC");
    expect(page.html()).not.toContain("Loading match");
    expect(page.html()).not.toContain("temporarily unavailable");
    expect(page.button()).toBeNull();
  });

  it("says it could not find the match when the retry finds none", async () => {
    rt.fixture.mockResolvedValue(null);
    const page = mount({ data: null, failed: true });
    page.click();
    await page.settle();
    expect(page.html()).toContain("We couldn’t find this match.");
  });

  it("shows the alert again when the retry fails too, and the button works again", async () => {
    rt.fixture.mockRejectedValueOnce(new Error("still down"));
    const page = mount({ data: null, failed: true });
    page.click();
    await page.settle();
    expect(rt.fixture).toHaveBeenCalledTimes(1);
    expect(page.html()).toContain("This match summary is temporarily unavailable.");
    page.click();
    await page.settle();
    expect(rt.fixture).toHaveBeenCalledTimes(2);
    expect(page.html()).toContain("RCFC|Ocelot FC");
  });
});

describe("a match the server did read", () => {
  it("is shown without any browser fetch", async () => {
    const page = mount({ data: { fixture: match as never, clubLabel: "RCFC" }, failed: false });
    await page.settle();
    expect(page.html()).toContain("RCFC|Ocelot FC");
    expect(rt.fixture).not.toHaveBeenCalled();
    expect(rt.identity).not.toHaveBeenCalled();
  });

  it("is fetched in the browser when nothing was served", async () => {
    const page = mount();
    expect(page.html()).toContain("Loading match…");
    await page.settle();
    expect(rt.fixture).toHaveBeenCalledWith(FIXTURE_ID, rt.club.id);
    expect(page.html()).toContain("RCFC|Ocelot FC");
  });
});
