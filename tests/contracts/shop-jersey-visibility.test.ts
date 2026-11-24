import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CinematicShop, { type CinematicShopProps } from "@/components/cinematic/CinematicShop";
import CinematicShopFields from "@/components/admin/shop/CinematicShopFields";
import { RoseCityShopFields, type ShopFieldsProps } from "@/components/admin/shop/rose-city/RoseCityShopFields";
import {
  cinematicShopContentSchema, EMPTY_CINEMATIC_SHOP_CONTENT, isShopEditionShown, shopContentOnly, shopEditionSchema, withShopEditionShown, type ShopEdition,
} from "@/lib/cinematic-shop-content";
import { shopSaveRequestSchema, type ShopSnapshot } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, publicKit, toShopSaveRequest } from "@/lib/shop-editor/model";

/**
 * SAM-VISIBILITY-AND-HEADER-SPONSOR item 3: show or hide each jersey on the Rose City Shop. Only an explicit `visible: false` hides a
 * jersey; a missing or true key shows it. Saves send the key for a hidden jersey only, because production's
 * validate_cinematic_shop_content rejects `visible` until the orchestrator's migration is applied.
 */

/** The editor fields call useId; reading their element tree directly (as the kit's PreviewCards test does) needs a stand-in outside a render. */
const direct = vi.hoisted(() => ({ on: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useId: () => (direct.on ? ":r0:" : actual.useId()) };
});

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const operationId = "1c9d50f5-a8e5-41de-901b-7ef884155a09";
const edition = (label: string, extra: Partial<ShopEdition> = {}): ShopEdition => ({ label, price: "$115", line: `${label} line`, link: "", ...extra });
const stored = {
  mapAssetId: null, mapAlt: "", mapVisible: true, mapCrop: null, sponsorsHeading: "Partners", sponsorsVisible: true,
  homeLabel: "Home", awayLabel: "Away", galleryLabel: "Kit photos", emptyMessage: "The shop opens soon", leadScale: 80, leadTop: 5,
};

/* ---------------------------------------------------------------- saved content */
describe("jersey visibility: what is saved", () => {
  const three = [edition("Home jersey"), edition("Away jersey"), edition("Third jersey")];

  it("a Shop saved before this feature (no visible keys) parses as every jersey shown, with no key invented", () => {
    const parsed = cinematicShopContentSchema.parse({ ...stored, editions: three });
    expect(parsed.editions.map(isShopEditionShown)).toEqual([true, true, true]);
    for (const item of parsed.editions) expect(item).not.toHaveProperty("visible");
    expect(parsed.editions.map(item => Object.keys(item).sort())).toEqual([["label", "line", "link", "price"], ["label", "line", "link", "price"], ["label", "line", "link", "price"]]);
  });

  it("only an explicit false hides a jersey, and visible must be a real boolean", () => {
    expect([undefined, true].map(visible => isShopEditionShown({ visible }))).toEqual([true, true]);
    expect(isShopEditionShown({ visible: false })).toBe(false);
    expect(shopEditionSchema.parse(edition("Away", { visible: false })).visible).toBe(false);
    expect(shopEditionSchema.parse(edition("Away", { visible: true })).visible).toBe(true);
    for (const visible of ["false", 0, null, "hidden"]) expect(shopEditionSchema.safeParse({ ...edition("Away"), visible }).success, String(visible)).toBe(false);
    expect(shopEditionSchema.safeParse({ ...edition("Away"), hidden: true }).success).toBe(false);
  });

  it("an explicit false persists through shopContentOnly, and true is never emitted", () => {
    const parsed = cinematicShopContentSchema.parse({ ...stored, editions: [edition("Home jersey", { visible: true }), edition("Away jersey", { visible: false }), edition("Third jersey")] });
    const saved = shopContentOnly(parsed);
    expect(saved.editions[0]).toEqual(edition("Home jersey"));
    expect(saved.editions[0]).not.toHaveProperty("visible");
    expect(saved.editions[1]).toEqual({ ...edition("Away jersey"), visible: false });
    expect(saved.editions[2]).not.toHaveProperty("visible");
    expect(JSON.stringify(saved)).not.toContain('"visible":true');
    // What was saved loads back the same way.
    expect(cinematicShopContentSchema.parse(JSON.parse(JSON.stringify(saved))).editions.map(isShopEditionShown)).toEqual([true, false, true]);
  });

  it("a page that hides nothing sends exactly the four keys production accepts today, even if a draft carries visible true or undefined", () => {
    const parsed = cinematicShopContentSchema.parse({ ...stored, editions: three });
    const noisy = { ...parsed, editions: [{ ...three[0], visible: true }, { ...three[1], visible: undefined }, three[2]] };
    for (const value of [parsed, noisy]) {
      const saved = shopContentOnly(value);
      expect(saved.editions.map(item => Object.keys(item).sort())).toEqual(three.map(() => ["label", "line", "link", "price"]));
    }
  });

  it("the helpers set visibility without touching the jersey's own fields or any other jersey", () => {
    const away = edition("Away jersey", { link: "https://example.com/away" });
    const hidden = withShopEditionShown(away, false);
    expect(hidden).toEqual({ ...away, visible: false });
    expect(withShopEditionShown(hidden, true)).toEqual(away);
    expect(withShopEditionShown(hidden, true)).not.toHaveProperty("visible");
    expect(withShopEditionShown(away, true)).not.toHaveProperty("visible");
    expect(away).not.toHaveProperty("visible");
  });

  it("flows through the editor's own save request: hidden jerseys saved as false, the rest untouched, and the request still validates", () => {
    const snapshot: ShopSnapshot = {
      revision: "3", designRevision: "v2", templateKey: "cinematic@2", surface: "shop", sections: [], photos: [], photoRows: [], purchase: null, media: [],
      presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, editions: [edition("Home jersey"), edition("Away jersey"), edition("Third jersey")] },
    };
    const draft = draftFromShopSnapshot(snapshot);
    draft.presentation.editions = [draft.presentation.editions[0], withShopEditionShown(draft.presentation.editions[1], false), draft.presentation.editions[2]];
    draft.presentationChanged = true;
    const request = toShopSaveRequest(snapshot, draft, operationId);
    const forwarded = JSON.parse(JSON.stringify(shopSaveRequestSchema.parse(request)));
    expect(forwarded.presentation.editions.map((item: ShopEdition) => item.visible)).toEqual([undefined, false, undefined]);
    // Showing it again takes the key out of the request entirely.
    draft.presentation.editions = draft.presentation.editions.map(item => withShopEditionShown(item, true));
    const again = JSON.parse(JSON.stringify(shopSaveRequestSchema.parse(toShopSaveRequest(snapshot, draft, operationId))));
    expect(JSON.stringify(again.presentation.editions)).not.toContain("visible");
  });
});

/* ---------------------------------------------------------------- the public Shop page */
const LONG = "Authentic Rose City FC match jersey with the full crest and custom name and number printing";
function props(labels: [string, string, string] = ["Home jersey", "Away jersey", "Foothill Transit Edition jersey"]): CinematicShopProps {
  const section = { eyebrow: "Rose City FC match home 2027", title: "City of the Roses", description: "Represent Pasadena", bullet_points: ["League patch"], store_note: "", cta_label: "Buy now", cta_link: "https://example.com/kit" };
  const home = publicKit(section, [{ rowId: "home", assetId: null, url: "/lead.png", order: 0 }], "shop", "home");
  const away = publicKit({ ...section, eyebrow: "Rose City FC match away 2027", title: "Thorn Edition", description: "Away from home", cta_link: "https://example.com/away-kit" }, [{ rowId: "away", assetId: null, url: "/away.png", order: 0 }], "shop", "away");
  const third = publicKit({ ...section, eyebrow: "Foothill Transit 2027", title: "Going Good Places", description: "Foothill Transit Edition", bullet_points: ["Foothill crest"], cta_link: "https://example.com/third-kit" }, [{ rowId: "third", assetId: null, url: "/third.png", order: 0 }], "shop", "third");
  const row = (variant: "home" | "away" | "third") => [{ id: `row-${variant}`, kit_variant: variant, url: `/row-${variant}.png`, sort_order: 0, created_at: "" }];
  return {
    kits: { home, away, third }, photoRows: { home: row("home"), away: row("away"), third: row("third") },
    purchase: null,
    presentation: {
      ...EMPTY_CINEMATIC_SHOP_CONTENT, emptyMessage: "The shop opens soon",
      editions: [
        { label: labels[0], price: "$111", line: "Home line", link: "" },
        { label: labels[1], price: "$222", line: "Away line", link: "https://example.com/away-option" },
        { label: labels[2], price: "$333", line: "Third line", link: "" },
      ],
    },
    sponsors: [], treatments: {},
  };
}
const hide = (value: CinematicShopProps, ...positions: number[]): CinematicShopProps => ({
  ...value, presentation: { ...value.presentation, editions: value.presentation.editions.map((item, i) => positions.includes(i) ? { ...item, visible: false } : item) },
});
const render = (value: CinematicShopProps) => renderToStaticMarkup(createElement(CinematicShop, value));
/** The selector's buttons as [original position class, pressed, text]. */
const pills = (html: string) => [...html.matchAll(/<button type="button" class="shop-option (shop-option-\d)" aria-pressed="(true|false)">([^<]*)<\/button>/g)].map(match => [match[1], match[2], match[3]]);
/** What each kit puts on the page: its title, eyebrow, line, photos and Buy link. The price and label live on its pill, checked through `pills`. */
const HOME = ["City of the Roses</h1>", "Rose City FC match home 2027", "Home line", 'src="/lead.png"', 'src="/row-home.png"', 'href="https://example.com/kit"'];
const AWAY = ["Thorn Edition</h1>", "Rose City FC match away 2027", "Away line", 'src="/away.png"', 'src="/row-away.png"', 'href="https://example.com/away-option"'];
const THIRD = ["Going Good Places</h1>", "Foothill Transit 2027", "Third line", 'src="/third.png"', 'src="/row-third.png"', 'href="https://example.com/third-kit"'];
/** The page shows exactly one kit's content: `shown`'s, and none of the others'. */
const expectOnly = (html: string, shown: string[], others: string[][]) => {
  for (const text of shown) expect(html, text).toContain(text);
  for (const other of others) for (const text of other) expect(html, text).not.toContain(text);
};

describe("jersey visibility: the public Shop page", () => {
  it("renders exactly as before when no jersey is hidden, with visible true or absent", () => {
    const base = props();
    const explicit = { ...base, presentation: { ...base.presentation, editions: base.presentation.editions.map(item => ({ ...item, visible: true })) } };
    expect(render(explicit)).toBe(render(base));
    expect(pills(render(base))).toEqual([["shop-option-1", "true", "Home jersey $111"], ["shop-option-2", "false", "Away jersey $222"], ["shop-option-3", "false", "Foothill Transit Edition jersey $333"]]);
    expect(render(base)).not.toContain("shop-option-hidden");
    expect(render(base)).not.toContain("hidden on the website");
  });

  it("hiding a non-default jersey removes only its pill; the rest keep their own positions, colors and kits", () => {
    const html = render(hide(props(), 1));
    expect(pills(html)).toEqual([["shop-option-1", "true", "Home jersey $111"], ["shop-option-3", "false", "Foothill Transit Edition jersey $333"]]);
    expect(html).not.toContain("Away jersey");
    expect(html).not.toContain("$222");
    expectOnly(html, HOME, [AWAY, THIRD]);
    // Choosing the Third jersey shows the Third kit (not the Away kit that used to sit beside it), under its own colour class.
    const third = render({ ...hide(props(), 1), selectedVariant: "third" });
    expect(pills(third)).toEqual([["shop-option-1", "false", "Home jersey $111"], ["shop-option-3", "true", "Foothill Transit Edition jersey $333"]]);
    expectOnly(third, THIRD, [HOME, AWAY]);
    // Every pill still names its kit through its original position.
    const source = read("components/cinematic/CinematicShop.tsx");
    expect(source).toContain("onClick={() => choose(item.variant)}");
    expect(source).toContain("shop-option-${item.position + 1}");
  });

  it("hiding the default jersey starts on the first one shown, with that jersey's own kit, never Home's", () => {
    const html = render(hide(props(), 0));
    expect(pills(html)).toEqual([["shop-option-2", "true", "Away jersey $222"], ["shop-option-3", "false", "Foothill Transit Edition jersey $333"]]);
    expect(html).not.toContain("shop-option-1");
    expectOnly(html, AWAY, [HOME, THIRD]);
    expect(html).not.toContain("Home jersey");
    expect(html).not.toContain("$111");
    // A choice that is not on offer (the page's own first state, or a hidden jersey selected in a preview) falls back the same way.
    expect(render({ ...hide(props(), 0), selectedVariant: "home" })).toBe(html);
    expectOnly(render({ ...hide(props(), 0), selectedVariant: "third" }), THIRD, [HOME, AWAY]);
  });

  it("hiding Home and Away leaves Third as the one jersey, shown the way a single jersey option already is", () => {
    const html = render(hide(props(), 0, 1));
    // The existing one-jersey rendering keeps its heading and its one pill (the price lives on the pill).
    expect(html).toContain('<h2 class="shop-options-heading">Select your jersey</h2>');
    expect(pills(html)).toEqual([["shop-option-3", "true", "Foothill Transit Edition jersey $333"]]);
    expectOnly(html, THIRD, [HOME, AWAY]);
  });

  it("hiding every jersey shows the club's empty message in the jersey's place: no selector, heading, kit, photos or buy button", () => {
    const html = render(hide(props(), 0, 1, 2));
    expect(html).toContain('<p class="shop-empty-message">The shop opens soon</p>');
    for (const text of ["shop-option", "shop-jersey-options", "Select your jersey", "Jersey selection", "shop-variants", "Kit selection", "shop-feature", "<h1", "shop-photo-row", "shop-buy", 'src="/lead.png"', 'src="/away.png"', 'src="/third.png"', "/row-"]) expect(html, text).not.toContain(text);
    // A stale or explicit choice cannot bring a hidden kit back.
    for (const selectedVariant of ["home", "away", "third"] as const) expect(render({ ...hide(props(), 0, 1, 2), selectedVariant })).toBe(html);
  });

  it("hiding the only configured jersey also shows the empty message, not the Home/Away fallback", () => {
    const value = props();
    value.presentation.editions = [{ ...value.presentation.editions[0], visible: false }];
    const html = render(value);
    expect(html).toContain('<p class="shop-empty-message">The shop opens soon</p>');
    expect(html).not.toContain("shop-variants");
    expect(html).not.toContain("shop-feature");
  });

  it("a jersey whose kit or label is missing is still skipped as before, and hiding the rest cannot revive it", () => {
    const noThird = props(); noThird.kits.third = { section: null, photos: [] };
    expect(pills(render(noThird)).map(pill => pill[0])).toEqual(["shop-option-1", "shop-option-2"]);
    expect(render(hide(noThird, 0, 1))).toContain("shop-empty-message");
    const blank = props(); blank.presentation.editions[1] = { label: " ", price: "", line: "Away line", link: "" };
    expect(pills(render(hide(blank, 0))).map(pill => pill[0])).toEqual(["shop-option-3"]);
  });

  it("with no jersey options yet the Home/Away toggle stays, and a hidden kit is left out of it", () => {
    const plain = props(); plain.presentation.editions = [];
    expect(render(plain)).toContain('aria-label="Kit selection"');
    const partial = props();
    partial.presentation.editions = [{ label: "", price: "", line: "", link: "", visible: false }, { label: " ", price: "", line: "", link: "" }];
    const html = render(partial);
    expect(html).not.toContain("shop-option");
    expect(html).toContain("Thorn Edition</h1>");
    expect(html).not.toContain("City of the Roses</h1>");
    expect(html).not.toContain('aria-label="Kit selection"');
  });

  it("holds with three long labels: all hidden, the middle hidden, the default hidden", () => {
    const labels: [string, string, string] = [`${LONG} Home`, `${LONG} Away`, `${LONG} Third`];
    const base = props(labels);
    expect(pills(render(base)).map(pill => pill[2])).toEqual([`${LONG} Home $111`, `${LONG} Away $222`, `${LONG} Third $333`]);
    expect(pills(render(hide(base, 1))).map(pill => pill[0])).toEqual(["shop-option-1", "shop-option-3"]);
    expect(render(hide(base, 1))).not.toContain(`${LONG} Away`);
    expect(pills(render(hide(base, 0)))[0]).toEqual(["shop-option-2", "true", `${LONG} Away $222`]);
    const none = render(hide(base, 0, 1, 2));
    expect(none).not.toContain(LONG);
    expect(none).toContain("shop-empty-message");
    // A long label wraps inside its pill (existing rule), so hiding another jersey changes nothing about it.
    const css = read("components/cinematic/shop.css");
    const pill = css.match(/\.cinematic-site \.shop-option\{[^}]*\}/)![0];
    for (const rule of ["max-width:100%", "white-space:normal", "overflow-wrap:anywhere"]) expect(pill).toContain(rule);
  });

  it("an editor still reaches a hidden jersey: dimmed pill, named in the preview, kit and photos intact", () => {
    const value = { ...hide(props(), 1), editing: true, selectedVariant: "away" as const };
    const html = render(value);
    expect([...html.matchAll(/class="shop-option (shop-option-\d)[ "]/g)].map(match => match[1])).toEqual(["shop-option-1", "shop-option-2", "shop-option-3"]);
    expect(html).toContain('class="shop-option shop-option-2 shop-option-hidden" aria-pressed="true"');
    expect(html).toContain("(hidden on the website)");
    expect(html).toContain('<p data-shop-editor-target="editions" class="shop-hidden-label">This jersey is hidden on the website</p>');
    expectOnly(html, AWAY, [HOME, THIRD]);
    // The visitor's page has none of it.
    const visitor = render(hide(props(), 1));
    for (const text of ["shop-option-hidden", "hidden on the website", "shop-hidden-label"]) expect(visitor).not.toContain(text);
    // A jersey that is shown is not marked in the editor.
    const shown = render({ ...value, selectedVariant: "home" });
    expect(shown).not.toContain("This jersey is hidden on the website");
    // Editors with every jersey hidden still see the kit to edit it.
    const allOff = render({ ...hide(props(), 0, 1, 2), editing: true, selectedVariant: "home" });
    expect(allOff).toContain("City of the Roses</h1>");
    expect(allOff).not.toContain("shop-empty-message");
  });
});

/* ---------------------------------------------------------------- the editors */
type Tree = ReactElement<Record<string, unknown>>;
function collect(node: ReactNode, match: (element: Tree) => boolean, found: Tree[] = []): Tree[] {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) { node.forEach(child => collect(child, match, found)); return found; }
  const element = node as Tree;
  if (match(element)) found.push(element);
  return collect((element.props as { children?: ReactNode })?.children, match, found);
}
const noop = () => undefined;
function fieldProps(editions: ShopEdition[], updatePresentation: ShopFieldsProps["updatePresentation"] = noop): ShopFieldsProps & { id: "editions" } {
  const snapshot: ShopSnapshot = { revision: "1", designRevision: "v2", templateKey: "cinematic@2", surface: "shop", sections: [], photos: [], photoRows: [], purchase: null, media: [], presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, editions } };
  return {
    id: "editions", surface: "shop", kitId: "home", draft: draftFromShopSnapshot(snapshot), maxBulletPoints: 10, uploading: false,
    setSectionField: noop, setKitPhotos: noop, setRowPhotos: noop, uploadPhotos: noop, removePhoto: noop, updatePurchase: noop, updatePresentation,
    uploadMap: noop, removeMap: noop, uploadDetail: noop, removeDetail: noop,
  };
}
const fieldsMarkup = (editions: ShopEdition[]) => renderToStaticMarkup(createElement(RoseCityShopFields, fieldProps(editions)));
const SWITCH_LABEL = "Show this jersey in the shop";
/** CSS-module class names carry a hash of the file; keep the readable part. */
const plain = (markup: string) => markup.replace(/_(\w+?)_[0-9a-f]{6}/g, "$1");

describe("jersey visibility: the Jersey options editor", () => {
  const editions = [edition("Home jersey"), edition("Away jersey"), edition("Third jersey")];

  it("gives each jersey its own switch, labelled and first in that jersey's group", () => {
    const html = fieldsMarkup(editions);
    expect(html.match(/role="switch"/g)).toHaveLength(3);
    expect(html.match(new RegExp(`aria-label="${SWITCH_LABEL}"`, "g"))).toHaveLength(3);
    const groups = html.split("<fieldset").slice(1);
    expect(groups).toHaveLength(3);
    for (const group of groups) {
      expect(group.indexOf('role="switch"')).toBeGreaterThan(-1);
      expect(group.indexOf('role="switch"')).toBeLessThan(group.indexOf("Button label"));
      expect(group.indexOf(SWITCH_LABEL)).toBeLessThan(group.indexOf("Button label"));
      expect(group.match(/role="switch"/g)).toHaveLength(1);
    }
    // Every jersey starts shown.
    expect(html.match(/aria-checked="true"/g)).toHaveLength(3);
    expect(html).not.toContain('aria-checked="false"');
  });

  it("names a switched-off jersey with the kit's Hidden badge beside its switch, and keeps its fields editable", () => {
    const html = plain(fieldsMarkup([editions[0], { ...editions[1], visible: false }, editions[2]]));
    expect(html.match(/>Hidden</g)).toHaveLength(1);
    const groups = html.split("<fieldset").slice(1);
    // The badge is in the Away jersey's own switch row, which is the first row of its group.
    expect(groups[1]).toMatch(/<div class="switchRow" data-off="true"><span aria-hidden="true">Show this jersey in the shop<\/span><span class="switchEnd"><span class="offBadge" aria-hidden="true">Hidden<\/span><span class="control"><button[^>]*role="switch"[^>]*aria-checked="false"/);
    expect(groups[1].indexOf(">Hidden<")).toBeLessThan(groups[1].indexOf("Button label"));
    for (const shown of [groups[0], groups[2]]) {
      expect(shown).not.toContain("Hidden");
      expect(shown).not.toContain("data-off");
      expect(shown).toContain('aria-checked="true"');
    }
    // The legends stay the kit names.
    expect(groups.map(group => group.match(/<legend[^>]*>([^<]*)<\/legend>/)?.[1])).toEqual(["Home kit option", "Away kit option", "Third kit option"]);
    // Editing stays on while hidden: no field is disabled, and the switch is not a disabled one.
    expect(groups[1]).not.toMatch(/<input[^>]*disabled/);
    expect(groups[1]).not.toContain("aria-disabled");
    expect(groups[1]).toContain('value="Away jersey"');
    // Three hidden, three badges.
    expect(plain(fieldsMarkup(editions.map(item => ({ ...item, visible: false })))).match(/>Hidden</g)).toHaveLength(3);
  });

  it("toggling a switch hides or shows only that jersey, leaving the others and its own fields as they were", () => {
    const calls: [string, ShopEdition[]][] = [];
    const update = ((field: string, value: ShopEdition[]) => calls.push([field, value])) as ShopFieldsProps["updatePresentation"];
    direct.on = true;
    let tree: ReactElement;
    try { tree = RoseCityShopFields(fieldProps([editions[0], editions[1], { ...editions[2], visible: false }], update)) as ReactElement; } finally { direct.on = false; }
    const toggles = collect(tree, element => element.props.label === SWITCH_LABEL);
    expect(toggles.map(toggle => toggle.props.value)).toEqual([true, true, false]);
    (toggles[1].props.onChange as (show: boolean) => void)(false);
    (toggles[2].props.onChange as (show: boolean) => void)(true);
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe("editions");
    expect(calls[0][1][0]).toEqual(editions[0]);
    expect(calls[0][1][1]).toEqual({ ...editions[1], visible: false });
    expect(calls[0][1][2]).toEqual({ ...editions[2], visible: false });
    // Showing a jersey again takes the key out rather than writing true.
    expect(calls[1][1][2]).toEqual(editions[2]);
    expect(calls[1][1][2]).not.toHaveProperty("visible");
    // Each switch carries the kit's "Hidden" off badge.
    expect(toggles.map(toggle => toggle.props.offBadge)).toEqual(["Hidden", "Hidden", "Hidden"]);
  });

  it("the editor marks a switched-off jersey's own kit column, dims its preview, and the legacy fields carry the same switch", () => {
    const editor = read("components/admin/shop/rose-city/RoseCityShopEditor.tsx");
    // Option i is kit i: the column looks up its own kit's option, not its place on the page.
    expect(editor).toContain("draft.presentation.editions[KIT_ORDER.indexOf(kitId)]");
    expect(editor).toContain("data-hidden={hidden || undefined}");
    // The column's badge is the kit's own Hidden badge (hairline pill of text, no icon), the same one the switch rows use.
    expect(editor).toContain("{hidden && <span className={editorKit.offBadge}>Hidden</span>}");
    expect(editor).toContain('isShopEditionShown(e) ? "" : "(hidden)"');
    expect(read("components/admin/shop/rose-city/RoseCityShopEditor.module.css")).toContain(".kit[data-hidden] .previewBox { opacity: .6; }");
    // CinematicShopFields (the older Shop editor's jersey options) gets the same switch and badge.
    const legacy = renderToStaticMarkup(createElement(CinematicShopFields, {
      target: "editions", value: { ...EMPTY_CINEMATIC_SHOP_CONTENT, editions: [editions[0], { ...editions[1], visible: false }] }, onChange: noop, uploading: false,
      onUploadMap: noop, onRemoveMap: noop, onUploadDetail: noop, onRemoveDetail: noop,
    }));
    expect(legacy.match(new RegExp(`aria-label="${SWITCH_LABEL}"`, "g"))).toHaveLength(2);
    expect(legacy.match(/>Hidden</g)).toHaveLength(1);
    expect(legacy.split("<fieldset")[2]).toContain('aria-checked="false"');
    expect(legacy.split("<fieldset")[2].indexOf(">Hidden<")).toBeLessThan(legacy.split("<fieldset")[2].indexOf("Button label"));
  });
});
