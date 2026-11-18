import { MAX_SHOP_SIZE_COLUMNS, type CinematicShopPresentation } from "@/lib/cinematic-shop-content";

type SizeChart = CinematicShopPresentation["sizeChart"];

/** Typed "S, M, L" to saved columns. Same rule as the editor always used: at most 8, a trailing blank is dropped. */
export function sizeColumnsFromText(text: string): string[] {
  return text.split(",").map(size => size.trim()).slice(0, MAX_SHOP_SIZE_COLUMNS).filter((size, i, all) => size || i < all.length - 1);
}

/** Rows for TableEditor: the measurement label first, then one value per size. */
export function sizeTableRows(chart: SizeChart): string[][] {
  return chart.rows.map(row => [row.label, ...chart.columns.map((_, i) => row.values[i] ?? "")]);
}

/** Back from TableEditor rows to the saved shape. Each row keeps exactly one value per size. */
export function sizeRowsFromTable(rows: readonly (readonly string[])[], columnCount: number): SizeChart["rows"] {
  return rows.map(row => ({ label: row[0] ?? "", values: Array.from({ length: columnCount }, (_, i) => row[i + 1] ?? "") }));
}

/** Slider bounds, shared by the editor and the contract test. They match cinematicShopContentSchema. */
export const LEAD_SCALE_BOUNDS = { min: 30, max: 100, step: 0.5 } as const;
export const LEAD_TOP_BOUNDS = { min: 0, max: 30, step: 0.5 } as const;

export function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Which kit columns the page shows: Home always, a later kit once it has a jersey option, a saved kit or photos. */
export function visibleKits(options: { editionCount: number; kits: Record<"home" | "away" | "third", { exists: boolean; photoCount: number }> }, order: readonly ("home" | "away" | "third")[]): ("home" | "away" | "third")[] {
  return order.filter((kit, index) => index === 0 || index < options.editionCount || options.kits[kit].exists || options.kits[kit].photoCount > 0);
}
