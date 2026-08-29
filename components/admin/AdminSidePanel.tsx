"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  SlidingPanel,
  type SlidingPanelDirection,
} from "@/components/ui/sliding-panel";

type AdminSidePanelProps = {
  /** Whether the panel is mounted and visible. */
  open: boolean;
  /** Called on backdrop click, Escape, and the header close button. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /**
   * Identifies which record/form is currently shown. Pass a stable key per
   * record (e.g. the row id, or "add" for a fresh create form) so switching
   * targets while the panel stays open animates via SlidingPanel instead of
   * snapping.
   */
  activeKey: string | number;
  /** Slide direction for the SlidingPanel content swap. Defaults to 1. */
  direction?: SlidingPanelDirection;
  children: ReactNode;
  className?: string;
};

/**
 * Right-edge edit panel for admin list pages. Reuses `SlidingPanel` (already
 * used on this page for the Players/Staff tab switch) to animate the form
 * content whenever `activeKey` changes — including retargeting the panel to
 * a different record while it stays open. The panel chrome itself (fixed
 * backdrop + dialog, Escape-to-close, body scroll lock, focus restore)
 * follows the same conventions as `AdminRouteSearch` and the mobile admin
 * sidebar drawer elsewhere in this app.
 *
 * This is the pilot for the edit-in-a-side-panel pattern (roster ->
 * schedule -> season stats). Import this component directly rather than
 * re-implementing the drawer chrome per page.
 */
export function AdminSidePanel({
  open,
  onClose,
  title,
  description,
  activeKey,
  direction = 1,
  children,
  className,
}: AdminSidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panelRef.current?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => previouslyFocusedRef.current?.focus());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-foreground/10 backdrop-blur-[1px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card text-card-foreground shadow-xl outline-none",
          className,
        )}
      >
        <div className="flex flex-none items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
            {description && (
              <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SlidingPanel activeKey={activeKey} direction={direction} className="p-5">
            {children}
          </SlidingPanel>
        </div>
      </div>
    </>
  );
}
