import { derivePageSaveState, type PageSaveFailure, type PageSaveState } from "@/components/admin/ui/editor-kit/pageSaveState";
import type { SaveState } from "@/components/admin/ui/useSaveState";

/**
 * What the Save button shows on the Foothill Transit and Chick-fil-A pages. "Retry same save" and Save both
 * go through useSaveState, so a save that succeeds always passes saving then saved, retried or not.
 * A running save wins over every failure.
 */
export function partnerPageState(args: { base: SaveState; busy: boolean; uploading: boolean; pending: boolean; conflict: boolean; saveFailed: boolean }): PageSaveState {
  if (args.busy) return "saving";
  const failure: PageSaveFailure | null = args.pending ? "retry" : args.conflict ? "conflict" : args.saveFailed ? "error" : null;
  const base: SaveState = args.uploading && args.base === "dirty" ? "clean" : args.base;
  return derivePageSaveState(base, failure);
}
