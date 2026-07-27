import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { vi } from "vitest";

export async function loadContract<T>(
  modulePath: string,
  exportName: string,
): Promise<T> {
  const relativePath = modulePath.replace(/^@\//, "");
  const candidates = [
    resolve(process.cwd(), `${relativePath}.ts`),
    resolve(process.cwd(), `${relativePath}.tsx`),
    resolve(process.cwd(), relativePath, "index.ts"),
  ];

  const exists = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await access(candidate);
        return true;
      } catch {
        return false;
      }
    }),
  );

  if (!exists.some(Boolean)) {
    throw new Error(
      `[RED CONTRACT] Missing planned module ${modulePath}. ` +
        `Implement ${exportName} without changing this test contract.`,
    );
  }

  let imported: Record<string, unknown>;
  try {
    imported = await vi.importActual<Record<string, unknown>>(modulePath);
  } catch (error) {
    throw new Error(
      `[RED CONTRACT] Could not load planned module ${modulePath}: ${String(error)}`,
    );
  }

  if (!(exportName in imported)) {
    throw new Error(
      `[RED CONTRACT] ${modulePath} must export ${exportName}.`,
    );
  }

  return imported[exportName] as T;
}

export function expectContractError(
  action: () => unknown | Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  return Promise.resolve()
    .then(action)
    .then(() => {
      throw new Error(
        `[RED CONTRACT] Expected operation to fail with ${expectedCode}.`,
      );
    })
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message.startsWith("[RED CONTRACT] Expected operation")
      ) {
        throw error;
      }
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code !== expectedCode) {
        throw new Error(
          `[RED CONTRACT] Expected ${expectedCode}, received ${code || String(error)}.`,
        );
      }
    });
}
