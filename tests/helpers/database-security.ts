import { expect } from "vitest";

type PostgrestErrorLike = {
  code?: string;
  message: string;
};

type StorageErrorLike = {
  message: string;
  statusCode?: string;
};

const TEST_AUTHORING_ERROR_CODES = new Set(["PGRST204", "PGRST205"]);

export function expectPostgrestError(
  error: PostgrestErrorLike | null,
  expectedCode: string,
  context: string,
) {
  if (error?.code && TEST_AUTHORING_ERROR_CODES.has(error.code)) {
    throw new Error(
      `[TEST AUTHORING ERROR] ${context}: received ${error.code} (${error.message}) ` +
        "before the intended authorization or constraint boundary was reached.",
    );
  }

  expect(
    error?.code,
    `${context}: expected database error ${expectedCode}, received ` +
      `${error?.code ?? "no error"} (${error?.message ?? "operation succeeded"})`,
  ).toBe(expectedCode);
}

export function expectStorageError(
  error: StorageErrorLike | null,
  expected: { statusCode: string; message: string | RegExp },
  context: string,
) {
  expect(
    error?.statusCode,
    `${context}: expected Storage status ${expected.statusCode}, received ` +
      `${error?.statusCode ?? "no error"} (${error?.message ?? "upload succeeded"})`,
  ).toBe(expected.statusCode);

  if (typeof expected.message === "string") {
    expect(error?.message, context).toBe(expected.message);
  } else {
    expect(error?.message, context).toMatch(expected.message);
  }
}

const WEAK_DATABASE_ASSERTIONS = [
  {
    label: "generic non-null error assertion",
    pattern:
      /expect\s*\(\s*(?:[A-Za-z_$][\w$]*\.)*error(?:\s*,[\s\S]{0,160}?)?\s*\)\s*\.not\.toBeNull\(\)/g,
  },
  {
    label: "query error converted into an empty result",
    pattern: /error\s*===\s*null\s*\?\s*data\s*:\s*\[\s*\]/g,
  },
] as const;

export function findWeakDatabaseAssertions(source: string): string[] {
  return WEAK_DATABASE_ASSERTIONS.flatMap(({ label, pattern }) =>
    Array.from(source.matchAll(pattern), (match) => `${label}: ${match[0]}`),
  );
}
