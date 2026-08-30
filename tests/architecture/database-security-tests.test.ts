import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findWeakDatabaseAssertions } from "../helpers/database-security";

const DATABASE_TEST_ROOT = resolve(process.cwd(), "tests/database");

describe("database security test architecture", () => {
  it("contains no generic denial assertions or swallowed query errors", async () => {
    const files = (await readdir(DATABASE_TEST_ROOT)).filter((file) =>
      file.endsWith(".test.ts"),
    );
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(resolve(DATABASE_TEST_ROOT, file), "utf8");
      for (const violation of findWeakDatabaseAssertions(source)) {
        violations.push(`${file}: ${violation}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
