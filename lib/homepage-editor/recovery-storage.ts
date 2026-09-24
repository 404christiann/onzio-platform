"use client";

// Persistence is best-effort. Callers surface unavailability without blocking
// editing, and clears compare the acknowledged record in the same transaction.
const DB_NAME = "onzio-homepage-editor";
const DRAFTS_STORE = "drafts";
const FILES_STORE = "files";
export const RECOVERY_UNAVAILABLE = Symbol("recovery-unavailable");

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let settled = false;
    const fail = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error("Recovery storage unavailable")); } };
    const timer = setTimeout(fail, 2000);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) db.createObjectStore(DRAFTS_STORE);
      if (!db.objectStoreNames.contains(FILES_STORE)) db.createObjectStore(FILES_STORE);
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timer); resolve(request.result);
    };
    request.onerror = fail;
    request.onblocked = fail;
  });
}

async function withStore<T>(name: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = run(tx.objectStore(name));
      // A successful request is not yet a committed transaction (quota errors
      // and aborts may arrive afterward).
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function recoveryStorageKey(clubId: string, userId: string): string { return `${clubId}:${userId}`; }
export async function readRecoveryRecord(key: string): Promise<unknown> {
  try { return (await withStore(DRAFTS_STORE, "readonly", store => store.get(key))) ?? null; }
  catch { return RECOVERY_UNAVAILABLE; }
}
export async function writeRecoveryRecord(key: string, record: unknown, guard?: { expected: unknown }): Promise<"written" | "newer-record" | "unavailable"> {
  try {
    const db = await openDb();
    try {
      return await new Promise<"written" | "newer-record">((resolve, reject) => {
        const tx = db.transaction(DRAFTS_STORE, "readwrite");
        const store = tx.objectStore(DRAFTS_STORE);
        let written = false;
        const request = store.get(key);
        request.onsuccess = () => {
          // Compare even when either side is absent: another tab may have
          // created or cleared the record since this tab last read it.
          if (guard && JSON.stringify(request.result ?? null) !== JSON.stringify(guard.expected ?? null)) return;
          store.put(record, key); written = true;
        };
        tx.oncomplete = () => resolve(written ? "written" : "newer-record");
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  catch { return "unavailable"; }
}

/** Never erase a newer record or its pending files written by another tab. */
export async function clearRecoveryRecord(key: string, expected: unknown, ownedFileKeys: string[] = []): Promise<boolean> {
  if (expected === RECOVERY_UNAVAILABLE || (expected == null && ownedFileKeys.length === 0)) return true;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([DRAFTS_STORE, FILES_STORE], "readwrite");
        const drafts = tx.objectStore(DRAFTS_STORE);
        const request = drafts.get(key);
        request.onsuccess = () => {
          const matches = request.result != null && JSON.stringify(request.result) === JSON.stringify(expected);
          if (matches) drafts.delete(key);
          const protectedKeys = new Set<string>(matches ? [] : (request.result?.draft?.photos?.items ?? []).map((photo: { localFileKey?: string }) => photo.localFileKey));
          const fileKeys = new Set((expected as { draft?: { photos?: { items?: { localFileKey?: string }[] } } } | null)?.draft?.photos?.items?.map(photo => photo.localFileKey) ?? []);
          ownedFileKeys.forEach(fileKey => fileKeys.add(fileKey));
          const files = tx.objectStore(FILES_STORE);
          const cursorRequest = files.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            if (cursor.value.scopeKey === key && fileKeys.has(String(cursor.key)) && !protectedKeys.has(String(cursor.key))) cursor.delete();
            cursor.continue();
          };
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return true;
    } finally { db.close(); }
  } catch { return false; }
}
export async function writeRecoveryFile(fileKey: string, scopeKey: string, file: File): Promise<boolean> {
  try { await withStore(FILES_STORE, "readwrite", store => store.put({ scopeKey, file }, fileKey)); return true; }
  catch { return false; }
}
export async function readRecoveryFile(fileKey: string, expectedScopeKey: string): Promise<File | null | typeof RECOVERY_UNAVAILABLE> {
  try {
    const entry = await withStore<{ scopeKey: string; file: File } | undefined>(FILES_STORE, "readonly", store => store.get(fileKey));
    return entry?.scopeKey === expectedScopeKey ? entry.file : null;
  } catch { return RECOVERY_UNAVAILABLE; }
}
