import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { homepageDraft } from "../fixtures/homepage-editor";
import { defaultCinematicHomepageContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import type { PieceId } from "@/lib/homepage-editor/model";
import CinematicHomepageFields from "@/components/admin/homepage/CinematicHomepageFields";
import HomepageRecoveryReview from "@/components/admin/homepage/HomepageRecoveryReview";
import { EditorSwitch } from "@/components/admin/cinematic-editor/CinematicEditorKit";

vi.mock("@/components/ResilientNativeImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));

type Props = Parameters<typeof CinematicHomepageFields>[0];
const SWITCHES: { piece: PieceId; label: string; key: "raffle" | "match" | "prices" | "ticket" }[] = [
  { piece: "revamp.raffle", label: "Show raffle photo on homepage", key: "raffle" },
  { piece: "revamp.match", label: "Show next home match on homepage", key: "match" },
  { piece: "revamp.prices", label: "Show ticket prices on homepage", key: "prices" },
  { piece: "revamp.ticket", label: "Show ticket and map on homepage", key: "ticket" },
];
const propsFor = (piece: PieceId, content = defaultCinematicHomepageContent(), extra: Partial<Props> = {}): Props => ({
  piece, content, disabled: false, change: () => undefined, replaceArtwork: () => undefined, retryArtwork: () => undefined, ...extra,
});
const html = (props: Props) => renderToStaticMarkup(createElement(CinematicHomepageFields, props));
/** The component has no hooks of its own, so calling it returns its element tree for the test to walk and invoke handlers on. */
function elements(node: unknown, found: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach(child => elements(child, found));
  else if (isValidElement(node)) { found.push(node); elements((node.props as { children?: unknown }).children, found); }
  return found;
}
const tree = (props: Props) => elements(CinematicHomepageFields(props));
const propsOf = (element: ReactElement) => element.props as Record<string, unknown> & { onChange?: (value: never) => void };
const hiddenContent = (key: "raffle" | "match" | "prices" | "ticket") => { const content = defaultCinematicHomepageContent(); content[key].visible = false; return content; };

describe("homepage show/hide switches in the editor", () => {
  for (const { piece, label, key } of SWITCHES) {
    it(`${piece} opens with "${label}" as its first row, shown by default`, () => {
      const markup = html(propsFor(piece));
      const first = markup.match(/<button[^>]*>/)?.[0] ?? "";
      expect(first).toContain('role="switch"');
      expect(first).toContain(`aria-label="${label}"`);
      expect(first).toContain('aria-checked="true"');
      expect(markup.indexOf(label)).toBeLessThan(markup.indexOf("<label"));
      expect(markup).not.toContain("Hidden</span>");
    });

    it(`${piece} marks a hidden section with a Hidden badge and keeps editing on`, () => {
      const markup = html(propsFor(piece, hiddenContent(key)));
      expect(markup.match(/<button[^>]*>/)?.[0]).toContain('aria-checked="false"');
      expect(markup.match(/>Hidden<\/span>/g)).toHaveLength(1);
      // The badge is for sight only: the switch keeps its label as its name.
      expect(markup).toMatch(/aria-hidden="true">Hidden<\/span>/);
      expect(markup).not.toMatch(/\sdisabled(=|\s|>)/);
    });
  }

  it("turns raffle, match and prices off and back on through visible", () => {
    for (const { piece, label, key } of SWITCHES.filter(item => item.key !== "ticket")) {
      const change = vi.fn();
      const content = defaultCinematicHomepageContent();
      const toggle = (current: CinematicHomepageContent) => tree(propsFor(piece, current, { change })).find(element => propsOf(element).label === label)!;
      propsOf(toggle(content)).onChange!(false as never);
      const off = change.mock.calls[0][0] as CinematicHomepageContent;
      expect(off[key as "raffle"].visible).toBe(false);
      expect(content[key as "raffle"]).not.toHaveProperty("visible");
      propsOf(toggle(off)).onChange!(true as never);
      expect((change.mock.calls[1][0] as CinematicHomepageContent)[key as "raffle"].visible).toBe(true);
    }
  });

  it("keeps the ticket switch writing its required boolean", () => {
    const change = vi.fn();
    const toggle = tree(propsFor("revamp.ticket", defaultCinematicHomepageContent(), { change })).find(element => propsOf(element).label === "Show ticket and map on homepage")!;
    propsOf(toggle).onChange!(false as never);
    expect((change.mock.calls[0][0] as CinematicHomepageContent).ticket.visible).toBe(false);
  });

  it("holds every switch while the editor is busy", () => {
    for (const { piece, label } of SWITCHES) {
      const toggle = tree(propsFor(piece, defaultCinematicHomepageContent(), { disabled: true })).find(element => propsOf(element).label === label)!;
      expect(propsOf(toggle).disabled).toBe(true);
    }
  });

  it("the kit shows the off badge only for switches that ask for one, and only while off", () => {
    const render = (checked: boolean, offBadge?: string) => renderToStaticMarkup(createElement(EditorSwitch, { label: "Show it", checked, disabled: false, onChange: () => undefined, offBadge }));
    expect(render(false, "Hidden")).toContain("Hidden</span>");
    expect(render(true, "Hidden")).not.toContain("Hidden");
    expect(render(false)).not.toContain("Hidden");
    expect(render(false)).toContain('role="switch"');
  });

  it("names a hidden part in the Overview's part list", () => {
    const overview = readFileSync("components/admin/homepage/HomepageOverviewEditor.tsx", "utf8");
    expect(overview).toContain("hiddenHomepageParts(state.draft)");
    expect(overview).toContain('"Hidden on the page"');
  });
});

describe("header sponsor logo slot in the Menu and footer part", () => {
  const menu = (content = defaultCinematicHomepageContent(), extra: Partial<Props> = {}) => propsFor("revamp.navigation", content, { part: "menu", ...extra });
  const withHeader = () => { const content = defaultCinematicHomepageContent(); content.presentation.headerPartner = { assetId: "00000000-0000-4000-8000-000000000002", url: "https://cdn.example.test/header.png", alt: "Valley Credit Union" }; return content; };
  const slot = (props: Props, legend: string) => tree(props).find(element => propsOf(element).legend === legend)!;

  it("sits above the footer logo with its own words", () => {
    const markup = html(menu());
    expect(markup).toContain("<legend>Header sponsor logo</legend>");
    expect(markup).toContain("Optional. Appears in the top header next to the menu. Remove it to show nothing there.");
    expect(markup.indexOf("Header sponsor logo")).toBeLessThan(markup.indexOf("Footer logo"));
    expect(markup).toContain("Rename the tabs and menu links");
  });

  it("is not part of External forms", () => {
    expect(html(propsFor("revamp.navigation", defaultCinematicHomepageContent(), { part: "forms" }))).not.toContain("Header sponsor logo");
  });

  it("offers Remove only while there is a logo, and names it", () => {
    expect(html(menu())).not.toContain("Remove header sponsor logo");
    const markup = html(menu(withHeader()));
    expect(markup).toContain("Remove header sponsor logo");
    expect(markup).toContain('alt="Valley Credit Union"');
    expect(markup).toContain("Replace image");
  });

  it("replaces, retries and removes through the header slot, leaving the footer logo alone", () => {
    const replaceArtwork = vi.fn(); const retryArtwork = vi.fn(); const change = vi.fn();
    const content = withHeader();
    content.footerLogo = { assetId: "00000000-0000-4000-8000-000000000009", url: "https://cdn.example.test/footer.png", alt: "Footer" };
    const header = propsOf(slot(menu(content, { replaceArtwork, retryArtwork, change }), "Header sponsor logo")) as unknown as { onFile: (file: File) => void; onRetry: () => void; onRemove: () => void; removeLabel: string };
    const file = new File([new Uint8Array([1])], "logo.png", { type: "image/png" });
    header.onFile(file);
    expect(replaceArtwork).toHaveBeenCalledWith("headerPartner", file);
    header.onRetry();
    expect(retryArtwork).toHaveBeenCalledWith("headerPartner");
    expect(header.removeLabel).toBe("Remove header sponsor logo");
    header.onRemove();
    const removed = change.mock.calls[0][0] as CinematicHomepageContent;
    expect(removed.presentation.headerPartner).toEqual({ assetId: null, url: null, alt: "" });
    expect(removed.footerLogo).toEqual(content.footerLogo);
    expect(content.presentation.headerPartner.url).toBe("https://cdn.example.test/header.png");
  });

  it("edits the typed description in place, up to the saved limit", () => {
    const change = vi.fn();
    const field = elements(propsOf(slot(menu(withHeader(), { change }), "Header sponsor logo")).children).find(element => propsOf(element).label === "Describe this image")!;
    expect(propsOf(field).value).toBe("Valley Credit Union");
    expect(propsOf(field).maximum).toBe(1000);
    propsOf(field).onChange!("Valley Credit Union, official bank" as never);
    expect((change.mock.calls[0][0] as CinematicHomepageContent).presentation.headerPartner.alt).toBe("Valley Credit Union, official bank");
  });

  it("shows an upload in progress and a failed upload with a retry, and holds Remove while uploading", () => {
    const uploading = withHeader(); uploading.presentation.headerPartner.upload = "uploading";
    const busy = html(menu(uploading));
    expect(busy).toContain("Adding your image…");
    expect(busy).not.toContain("Remove header sponsor logo");
    const failed = withHeader(); Object.assign(failed.presentation.headerPartner, { upload: "failed", error: "This artwork could not be added. Try again." });
    const markup = html(menu(failed));
    expect(markup).toContain("This artwork could not be added. Try again.");
    expect(markup).toContain("Try adding it again");
  });

  it("copes with the longest allowed description and no image at all", () => {
    const content = defaultCinematicHomepageContent();
    content.presentation.headerPartner.alt = "Valley ".repeat(142).slice(0, 1000);
    const markup = html(menu(content));
    expect(markup).toContain("No image yet");
    expect(markup).toContain('maxLength="1000"');
  });
});

describe("recovered draft review names every artwork slot", () => {
  it("compares the header sponsor logo and the three switches", () => {
    const current = { ...homepageDraft(), revamp: defaultCinematicHomepageContent() };
    const recoveredContent = defaultCinematicHomepageContent();
    recoveredContent.match.visible = false;
    recoveredContent.presentation.headerPartner = { assetId: "00000000-0000-4000-8000-000000000002", url: "https://cdn.example.test/header.png", alt: "Partner" };
    const markup = renderToStaticMarkup(createElement(HomepageRecoveryReview, {
      current, recovered: { ...homepageDraft(), revamp: recoveredContent }, reason: "CONTENT_CHANGED", allowedAction: "apply",
      close: () => undefined, restore: async () => true,
    }));
    for (const heading of ["Raffle artwork", "Ticket and map artwork", "Trophy image", "Footer logo", "Header sponsor logo", "Raffle photo shown", "Next home match shown", "Ticket prices shown"]) expect(markup).toContain(`<h3>${heading}</h3>`);
    expect(markup).toContain("Recovered draft uses a different image.");
    expect(markup).toMatch(/<h3>Next home match shown<\/h3><dl><div><dt>Latest homepage<\/dt><dd>Yes<\/dd><\/div><div><dt>Recovered draft<\/dt><dd>No<\/dd>/);
  });
});
