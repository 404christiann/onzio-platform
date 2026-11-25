import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { logoContentSchema } from "@/lib/about-editor/contract";
import { MEDIA_REFERENCE_FIELDS, nestedJsonFields } from "@/lib/media-reference-fields";

// The Club Logo page keeps its patch, icon and color-card images as urls inside the features and color_cards
// JSON columns. The orphan sweep may only leave them alone if each of those columns is in the database's
// reference registry (onzio_private.media_reference_columns), and the About editor's save only retires what it
// no longer finds through the same keys (onzio_private.about_editor_urls).

const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
const sql = (name: string) => readFileSync(`supabase/migrations/${name}`, "utf8");

/** Every (table, column) the migrations insert into onzio_private.media_reference_columns. */
function registeredColumns(): Set<string> {
  const registered = new Set<string>();
  for (const name of migrations) {
    const text = sql(name);
    const insert = /insert into onzio_private\.media_reference_columns[^;]*;/gi;
    for (const statement of text.match(insert) ?? []) {
      for (const [, table, column] of statement.matchAll(/\('onzio\.([a-z_]+)',\s*'([a-z_]+)'/g)) {
        registered.add(`${table}.${column}`);
      }
    }
  }
  return registered;
}

describe("Club Logo page nested image urls are references", () => {
  it("lists the patch, icon and color-card urls with the crest and map", () => {
    expect(MEDIA_REFERENCE_FIELDS.club_logo_page_content).toEqual([
      { source: "annotated_image_url", asset: "annotated_image_asset_id" },
      { source: "map_image_url", asset: "map_image_asset_id" },
      { json: "features", keys: ["patch_url", "icon_url"] },
      { json: "color_cards", keys: ["image_url"] },
    ]);
  });

  it("registers every nested JSON column in the database registry the sweep reads", () => {
    const registered = registeredColumns();
    for (const [table] of Object.entries(MEDIA_REFERENCE_FIELDS)) {
      for (const { json } of nestedJsonFields(table)) {
        expect(registered, `${table}.${json}`).toContain(`${table}.${json}`);
      }
    }
  });

  it("uses the same keys the About editor saves and its retire check reads", () => {
    const urls = sql("20261005160543_about_page_editor_receipts.sql");
    const saved = logoContentSchema.shape;
    for (const { json, keys } of nestedJsonFields("club_logo_page_content")) {
      const item = (saved[json as "features" | "color_cards"] as unknown as { element: { shape: Record<string, unknown> } }).element.shape;
      for (const key of keys) {
        expect(Object.keys(item), `${json}[].${key} in the save schema`).toContain(key);
        expect(urls, `${json}[].${key} in about_editor_urls`).toMatch(new RegExp(`f->>'${key}' from jsonb_array_elements\\([^)]*${json}`));
      }
    }
  });

  it("never gives a nested url an asset-id column the admin client would fill", async () => {
    for (const field of MEDIA_REFERENCE_FIELDS.club_logo_page_content) {
      if ("json" in field) expect(field).not.toHaveProperty("asset");
    }
  });
});
