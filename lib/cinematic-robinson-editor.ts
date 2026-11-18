import {
  MAX_ROBINSON_BLOCKS, MAX_ROBINSON_INFO_ROWS, ROBINSON_IMAGE_SLOTS,
  type RobinsonBlock, type RobinsonContent, type RobinsonImageSlot,
} from "@/lib/cinematic-robinson-content";

export function appendItem<T>(items: T[], item: T, max: number): T[] {
  return items.length >= max ? items : [...items, item];
}

export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const destination = index + delta;
  if (destination < 0 || destination >= items.length) return items;
  const next = [...items];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

export function removeItem<T>(items: T[], index: number): T[] {
  return items.filter((_, position) => position !== index);
}

export function addInfoRow(content: RobinsonContent): RobinsonContent {
  return { ...content, info: { ...content.info, rows: appendItem(content.info.rows, { label: "", available: true }, MAX_ROBINSON_INFO_ROWS) } };
}

export function addBlock(content: RobinsonContent): RobinsonContent {
  const taken = new Set(content.directions.blocks.map(block => block.id));
  let n = content.directions.blocks.length + 1;
  while (taken.has(`section-${n}`)) n += 1;
  const block: RobinsonBlock = { id: `section-${n}`, heading: "", paragraphs: [""], note: "", bullets: [], closing: "" };
  return { ...content, directions: { ...content.directions, blocks: appendItem(content.directions.blocks, block, MAX_ROBINSON_BLOCKS) } };
}

/** Block IDs are stable page anchors (the Stadium parking menu link targets one), so edits never change them. */
export function updateBlock(content: RobinsonContent, index: number, patch: Partial<Omit<RobinsonBlock, "id">>): RobinsonContent {
  return { ...content, directions: { ...content.directions,
    blocks: content.directions.blocks.map((block, position) => position === index ? { ...block, ...patch, id: block.id } : block) } };
}

export function setImage(content: RobinsonContent, slot: RobinsonImageSlot, assetId: string | null): RobinsonContent {
  return { ...content, images: { ...content.images, [slot]: { ...content.images[slot], assetId } } };
}

/** Images uploaded in this editing session that the draft no longer points at. */
export function unusedUploads(uploads: string[], content: RobinsonContent): string[] {
  const used = new Set(ROBINSON_IMAGE_SLOTS.map(slot => content.images[slot].assetId));
  return uploads.filter(id => !used.has(id));
}
