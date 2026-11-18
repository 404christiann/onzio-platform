import {
  MAX_KBYG_TILES, MAX_SEASON_BENEFITS, MAX_SEASON_PRICE_ROWS,
  type KnowBeforeYouGoContent, type SeasonMembershipContent, type TicketPageContent, type TicketPageKey,
} from "@/lib/cinematic-ticket-pages-content";
import { moveItem } from "@/lib/cinematic-robinson-editor";

/** The lists that carry their own image slot, keyed by the item's ID. */
type ListName<K extends TicketPageKey> = K extends "season-membership" ? "benefits" | "pricing" : "tiles";
type Item = { id: string };

const LISTS = {
  benefits: { prefix: "benefit", max: MAX_SEASON_BENEFITS, blank: (id: string) => ({ id, label: "" }),
    get: (c: SeasonMembershipContent) => c.benefits.items as Item[],
    set: (c: SeasonMembershipContent, items: Item[]) => ({ ...c, benefits: { ...c.benefits, items: items as SeasonMembershipContent["benefits"]["items"] } }) },
  pricing: { prefix: "seat", max: MAX_SEASON_PRICE_ROWS, blank: (id: string) => ({ id, name: "", prices: ["", "", ""] }),
    get: (c: SeasonMembershipContent) => c.pricing.rows as Item[],
    set: (c: SeasonMembershipContent, items: Item[]) => ({ ...c, pricing: { ...c.pricing, rows: items as SeasonMembershipContent["pricing"]["rows"] } }) },
  tiles: { prefix: "tile", max: MAX_KBYG_TILES, blank: (id: string) => ({ id, label: "" }),
    get: (c: KnowBeforeYouGoContent) => c.facts.tiles as Item[],
    set: (c: KnowBeforeYouGoContent, items: Item[]) => ({ ...c, facts: { ...c.facts, tiles: items as KnowBeforeYouGoContent["facts"]["tiles"] } }) },
} as const;

type AnyList = { prefix: string; max: number; blank: (id: string) => Item; get: (c: never) => Item[]; set: (c: never, items: Item[]) => unknown };
const list = (name: string) => LISTS[name as keyof typeof LISTS] as unknown as AnyList;

export function addListItem<K extends TicketPageKey>(_key: K, content: TicketPageContent<K>, name: ListName<K>): TicketPageContent<K> {
  const config = list(name), items = config.get(content as never);
  if (items.length >= config.max) return content;
  const taken = new Set([...items.map(item => item.id), ...Object.keys(content.images)]);
  let n = items.length + 1;
  while (taken.has(`${config.prefix}-${n}`)) n += 1;
  const id = `${config.prefix}-${n}`;
  const next = config.set(content as never, [...items, config.blank(id)]) as TicketPageContent<K>;
  return { ...next, images: { ...content.images, [id]: { assetId: null, alt: "" } } };
}

export function removeListItem<K extends TicketPageKey>(_key: K, content: TicketPageContent<K>, name: ListName<K>, index: number): TicketPageContent<K> {
  const config = list(name), items = config.get(content as never), removed = items[index];
  if (!removed) return content;
  const next = config.set(content as never, items.filter((_, position) => position !== index)) as TicketPageContent<K>;
  const { [removed.id]: _gone, ...images } = content.images;
  return { ...next, images };
}

export function moveListItem<K extends TicketPageKey>(_key: K, content: TicketPageContent<K>, name: ListName<K>, index: number, delta: -1 | 1): TicketPageContent<K> {
  const config = list(name), items = config.get(content as never), moved = moveItem(items, index, delta);
  return moved === items ? content : config.set(content as never, moved) as TicketPageContent<K>;
}

export function setTicketPageImage<T extends { images: Record<string, { assetId: string | null; alt: string }> }>(content: T, slot: string, assetId: string | null): T {
  if (!content.images[slot]) return content;
  return { ...content, images: { ...content.images, [slot]: { ...content.images[slot], assetId } } };
}

/** Images uploaded in this editing session that the draft no longer points at. */
export function unusedTicketPageUploads(uploads: string[], content: { images: Record<string, { assetId: string | null }> }): string[] {
  const used = new Set(Object.values(content.images).map(image => image.assetId));
  return uploads.filter(id => !used.has(id));
}
