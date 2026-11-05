import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { MAX_ROBINSON_BLOCKS, MAX_ROBINSON_INFO_ROWS, robinsonContentSchema, type RobinsonContent } from "@/lib/cinematic-robinson-content";
import { addBlock, addInfoRow, appendItem, moveItem, removeItem, setImage, unusedUploads, updateBlock } from "@/lib/cinematic-robinson-editor";
import { robinsonReferenceContent } from "@/lib/robinson-reference-content";

const reference = () => structuredClone(robinsonReferenceContent) as RobinsonContent;

describe("Robinson Stadium editor actions", () => {
  it("adds an info row without changing the original draft, and stops at the limit", () => {
    const original = reference(), next = addInfoRow(original);
    expect(original.info.rows).toHaveLength(6);
    expect(next.info.rows.at(-1)).toEqual({ label: "", available: true });
    let full = next;
    for (let i = 0; i < 20; i += 1) full = addInfoRow(full);
    expect(full.info.rows).toHaveLength(MAX_ROBINSON_INFO_ROWS);
    expect(robinsonContentSchema.safeParse(full).success).toBe(true);
  });

  it("moves items up and down, ignores moves past either end, and removes items", () => {
    const labels = reference().info.rows.map(row => row.label);
    expect(moveItem(labels, 0, 1).slice(0, 2)).toEqual(["Mobile Tickets", "On-Site Parking"]);
    expect(moveItem(labels, 0, -1)).toBe(labels);
    expect(moveItem(labels, labels.length - 1, 1)).toBe(labels);
    expect(removeItem(labels, 3)).not.toContain("Pets Allowed");
    expect(labels).toContain("Pets Allowed");
    expect(appendItem(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(appendItem(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("adds Directions blocks with new, valid IDs and keeps the parking anchor when its heading is renamed", () => {
    let content = reference();
    content = addBlock(content);
    content = addBlock(content);
    const ids = content.directions.blocks.map(block => block.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(robinsonContentSchema.safeParse(content).success).toBe(true);
    const parking = content.directions.blocks.findIndex(block => block.id === "parking-lot-no-5");
    const renamed = updateBlock(content, parking, { heading: "Parking" });
    expect(renamed.directions.blocks[parking]).toMatchObject({ id: "parking-lot-no-5", heading: "Parking" });
    for (let i = 0; i < 20; i += 1) content = addBlock(content);
    expect(content.directions.blocks).toHaveLength(MAX_ROBINSON_BLOCKS);
  });

  it("replaces an image in the draft only, and reports uploads the draft no longer uses", () => {
    const original = reference(), first = randomUUID(), second = randomUUID();
    const once = setImage(original, "seating", first);
    expect(original.images.seating.assetId).toBeNull();
    expect(once.images.seating).toEqual({ assetId: first, alt: original.images.seating.alt });
    const twice = setImage(once, "seating", second);
    expect(unusedUploads([first, second], twice)).toEqual([first]);
    expect(unusedUploads([first, second], setImage(twice, "lockers", first))).toEqual([]);
  });
});
