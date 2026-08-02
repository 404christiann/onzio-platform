import { describe, expect, it } from "vitest";
import {
  expectPostgrestError,
  expectStorageError,
  findWeakDatabaseAssertions,
} from "../helpers/database-security";

describe("database security assertion contract", () => {
  it.each(["PGRST204", "PGRST205"])(
    "treats %s as a test-authoring error instead of an authorization denial",
    (code) => {
      expect(() =>
        expectPostgrestError(
          { code, message: "fixture is absent or misspelled" },
          "42501",
          "security probe",
        ),
      ).toThrow(/\[TEST AUTHORING ERROR\]/);
    },
  );

  it("accepts only the expected database and Storage denial signatures", () => {
    expect(() =>
      expectPostgrestError(
        { code: "42501", message: "permission denied" },
        "42501",
        "database denial",
      ),
    ).not.toThrow();
    expect(() =>
      expectStorageError(
        {
          statusCode: "403",
          message: "new row violates row-level security policy",
        },
        {
          statusCode: "403",
          message: "new row violates row-level security policy",
        },
        "Storage denial",
      ),
    ).not.toThrow();
  });

  it("detects weak denial assertions and swallowed query errors", () => {
    expect(
      findWeakDatabaseAssertions(`
        expect(result.error).not.toBeNull();
        expect(error, "operation unexpectedly succeeded").not.toBeNull();
        expect(error === null ? data : []).toEqual([]);
      `),
    ).toHaveLength(3);
  });
});
