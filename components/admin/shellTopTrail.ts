/**
 * What the shell top bar shows on the left. A page that renders a PageFrame already
 * carries the one breadcrumb in its own header, so the top bar shows nothing there
 * (the slot stays mounted, so the bar's layout does not shift). Pages without a
 * frame keep the top-bar breadcrumb, or the route label when there is no trail.
 */
export type ShellTopTrail = "none" | "breadcrumb" | "label";

export function shellTopTrail(breadcrumb: readonly string[] | null | undefined, pageHasFrame: boolean): ShellTopTrail {
  if (pageHasFrame) return "none";
  return breadcrumb ? "breadcrumb" : "label";
}
