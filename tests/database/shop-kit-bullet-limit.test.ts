import { Client } from "pg";
import { expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";

const section = (count: number) => ({ eyebrow: "", title: "City of Roses", description: "", bullet_points: Array.from({ length: count }, (_, index) => `Item ${index + 1}`), store_note: "", cta_label: "Buy now", cta_link: "/shop" });

// save_shop_page uses validate_cinematic_shop_section for cinematic@2 kits and main's validate_shop_section(jsonb) for every
// other template. The 2-argument validate_shop_section(jsonb,boolean) is no longer called.
it("accepts up to ten jersey bullet points for cinematic@2 kits and keeps main's eight for every other template", async () => {
  assertSafeTestEnvironment();
  const db = new Client(localPostgresConfig());
  await db.connect();
  const rejects = async (sql: string, count: number) => {
    await db.query("savepoint too_many");
    try { await expect(db.query(sql, [JSON.stringify(section(count))])).rejects.toThrow("INVALID_SHOP_PAYLOAD"); }
    finally { await db.query("rollback to savepoint too_many"); }
  };
  try {
    await db.query("begin");
    const cinematic = "select onzio_private.validate_cinematic_shop_section($1::jsonb)";
    const main = "select onzio_private.validate_shop_section($1::jsonb)";
    for (const count of [0, 1, 8, 9, 10]) await db.query(cinematic, [JSON.stringify(section(count))]);
    await rejects(cinematic, 11);
    for (const count of [0, 1, 8]) await db.query(main, [JSON.stringify(section(count))]);
    await rejects(main, 9);
  } finally { await db.query("rollback"); await db.end(); }
});
