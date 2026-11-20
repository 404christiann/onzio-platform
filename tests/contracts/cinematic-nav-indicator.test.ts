import { beforeEach, describe, expect, it } from "vitest";
import { followNavIndicator } from "@/components/cinematic/nav-indicator";

// A minimal element tree: only the DOM surface followNavIndicator touches, with compound class selectors and the
// `:scope > .x` / `.a.b > .x` child forms it queries.
type Listener = (event: unknown) => void;
class FakeElement {
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  classes: Set<string>;
  attributes = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  style = { transform: "" };
  box = { left: 0, width: 0 };
  offsetWidth = 0;
  focusVisible = false;
  ownerDocument = { defaultView: null, fonts: undefined };
  constructor(className = "") { this.classes = new Set(className.split(" ").filter(Boolean)); }
  append(...children: FakeElement[]) { for (const child of children) { child.parent = this; this.children.push(child); } return this; }
  private is(compound: string) { return compound.split(".").filter(Boolean).every(name => this.classes.has(name)); }
  matches(selector: string) { return selector === ":focus-visible" ? this.focusVisible : this.is(selector); }
  closest(selector: string) { for (let node: FakeElement | null = this; node; node = node.parent) if (node.is(selector)) return node; return null; }
  contains(node: unknown) { for (let current = node as FakeElement | null; current; current = current.parent) if (current === this) return true; return false; }
  querySelector(selector: string): FakeElement | null {
    const [parentSelector, childSelector] = selector.includes(">") ? selector.split(">").map(part => part.trim()) : [null, selector];
    const walk = (node: FakeElement): FakeElement | null => {
      for (const child of node.children) {
        const parentOk = parentSelector === null || (parentSelector === ":scope" ? node === this : node.is(parentSelector));
        if (child.is(childSelector) && parentOk) return child;
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(this);
  }
  getBoundingClientRect() { return { left: this.box.left, width: this.box.width }; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  hasAttribute(name: string) { return this.attributes.has(name); }
  addEventListener(type: string, listener: Listener) { (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(listener); }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type: string, event: object) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

const item = (className: string, left: number, width: number) => Object.assign(new FakeElement(className), { box: { left, width } });
let nav: FakeElement, bar: FakeElement, home: FakeElement, club: FakeElement, clubGroup: FakeElement, aboutLink: FakeElement, schedule: FakeElement;
beforeEach(() => {
  home = item("nav-item", 110, 40);
  club = item("nav-item", 170, 50);
  aboutLink = item("", 160, 200);
  clubGroup = new FakeElement("nav-group").append(club, new FakeElement("dropdown").append(aboutLink));
  schedule = item("nav-item active", 300, 70);
  bar = new FakeElement("nav-indicator");
  nav = Object.assign(new FakeElement("desktop-nav"), { box: { left: 100, width: 400 }, offsetWidth: 400 }).append(home, clubGroup, schedule, bar);
});
const follow = () => followNavIndicator(nav as unknown as HTMLElement, bar as unknown as HTMLElement);
const position = () => {
  const match = bar.style.transform.match(/^translateX\((-?[\d.]+)px\) scaleX\(([\d.]+)\)$/);
  return match && bar.hasAttribute("data-visible") ? { x: Number(match[1]), width: Number(match[2]) } : null;
};
const under = (element: FakeElement) => ({ x: element.box.left - nav.box.left, width: element.box.width });
const pointer = (target: FakeElement, pointerType = "mouse") => nav.dispatch("pointerover", { target, pointerType });

describe("RC-NAV sliding underline follows the cursor and focus", () => {
  it("starts on the current tab and marks the nav ready", () => {
    follow();
    expect(position()).toEqual(under(schedule));
    expect(nav.hasAttribute("data-indicator-ready")).toBe(true);
  });
  it("moves to the tab under a mouse or pen, maps a drop-down link to its tab, and returns on leave", () => {
    follow();
    pointer(home);
    expect(position()).toEqual(under(home));
    pointer(aboutLink, "pen");
    expect(position()).toEqual(under(club));
    pointer(nav);
    expect(position()).toEqual(under(club));
    nav.dispatch("pointerleave", {});
    expect(position()).toEqual(under(schedule));
  });
  it("ignores touch", () => {
    follow();
    pointer(home, "touch");
    expect(position()).toEqual(under(schedule));
  });
  it("follows focus-visible keyboard focus, not plain focus, and returns when focus leaves the nav", () => {
    follow();
    nav.dispatch("focusin", { target: home });
    expect(position()).toEqual(under(schedule));
    home.focusVisible = true;
    nav.dispatch("focusin", { target: home });
    expect(position()).toEqual(under(home));
    nav.dispatch("focusout", { target: home, relatedTarget: club });
    expect(position()).toEqual(under(home));
    nav.dispatch("focusout", { target: home, relatedTarget: null });
    expect(position()).toEqual(under(schedule));
  });
  it("lets hover win over focus, and falls back to focus when the cursor leaves", () => {
    follow();
    home.focusVisible = true;
    nav.dispatch("focusin", { target: home });
    pointer(club);
    expect(position()).toEqual(under(club));
    nav.dispatch("pointerleave", {});
    expect(position()).toEqual(under(home));
  });
  it("holds on an open drop-down's tab after the cursor leaves, and hides when nothing is current", () => {
    const follower = follow();
    clubGroup.classes.add("open");
    follower.place();
    expect(position()).toEqual(under(club));
    clubGroup.classes.delete("open");
    schedule.classes.delete("active");
    follower.place();
    expect(position()).toBeNull();
  });
  it("measures in the nav's own units when an editor preview scales it", () => {
    nav.offsetWidth = 200;
    follow();
    expect(position()).toEqual({ x: 100, width: 35 });
  });
  it("is what the Rose City nav mounts on its desktop nav and indicator", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../../components/cinematic/CinematicNav.tsx", import.meta.url), "utf8");
    expect(source).toContain("followNavIndicator(desktopNav.current, indicator.current)");
    expect(source).toContain("follower.dispose()");
  });
  it("detaches every listener and the ready flag on dispose", () => {
    const follower = follow();
    expect(nav.listenerCount()).toBe(4);
    follower.dispose();
    expect(nav.listenerCount()).toBe(0);
    expect(nav.hasAttribute("data-indicator-ready")).toBe(false);
    pointer(home);
    expect(position()).toEqual(under(schedule));
  });
});
