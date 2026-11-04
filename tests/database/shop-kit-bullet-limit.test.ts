import { Client } from "pg";
import { expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";

const section = (count: number) => ({ eyebrow: "", title: "City of Roses", description: "", bullet_points: Array.from({ length: count }, (_, index) => `Item ${index + 1}`), store_note: "", cta_label: "Buy now", cta_link: "/shop" });

it("accepts up to ten jersey bullet points in a Shop save and rejects more", async () => {
  assertSafeTestEnvironment();
  const db = new Client(localPostgresConfig());
  await db.connect();
  try {
    await db.query("begin");
    for (const count of [1, 9, 10]) await db.query("select onzio_private.validate_shop_section($1::jsonb,false)", [JSON.stringify(section(count))]);
    await db.query("savepoint too_many");
    await expect(db.query("select onzio_private.validate_shop_section($1::jsonb,false)", [JSON.stringify(section(11))])).rejects.toThrow("INVALID_SHOP_PAYLOAD");
    await db.query("rollback to savepoint too_many");
  } finally { await db.query("rollback"); await db.end(); }
});
