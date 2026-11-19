/** Pure list edits behind the field pieces, so each one is unit-tested without a DOM. */

export function setStringAt(items: readonly string[], index: number, value: string): string[] {
  return items.map((item, position) => (position === index ? value : item));
}

export function appendString(items: readonly string[], max: number): string[] {
  return items.length >= max ? items.slice() : [...items, ""];
}

export function removeAt<T>(items: readonly T[], index: number, min = 0): T[] {
  return items.length <= min ? items.slice() : items.filter((_, position) => position !== index);
}

export function patchAt<T extends object>(items: readonly T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, position) => (position === index ? { ...item, ...patch } : item));
}

export function appendItem<T>(items: readonly T[], item: T, max: number): T[] {
  return items.length >= max ? items.slice() : [...items, item];
}

/** Rows as exactly `columns` strings each, padding short rows with "". */
export function normalizeRows(rows: readonly (readonly string[])[], columns: number): string[][] {
  return rows.map((row) => Array.from({ length: columns }, (_, column) => row[column] ?? ""));
}

export function setCell(rows: readonly (readonly string[])[], columns: number, rowIndex: number, columnIndex: number, value: string): string[][] {
  return normalizeRows(rows, columns).map((row, position) =>
    position === rowIndex ? row.map((cell, column) => (column === columnIndex ? value : cell)) : row,
  );
}

export function appendRow(rows: readonly (readonly string[])[], columns: number, maxRows: number): string[][] {
  const next = normalizeRows(rows, columns);
  return next.length >= maxRows ? next : [...next, Array.from({ length: columns }, () => "")];
}

export function removeRow(rows: readonly (readonly string[])[], columns: number, index: number, minRows = 0): string[][] {
  return normalizeRows(removeAt(rows, index, minRows), columns);
}

/** One item one place earlier (-1) or later (1). Only the order changes: the items themselves are the same objects. The first item cannot go earlier and the last cannot go later. */
export function moveAt<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items.slice();
  const next = items.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
