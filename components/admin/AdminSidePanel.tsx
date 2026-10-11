"use client";

import { X } from "@/components/admin/icons";
import { useEffect, useRef, type ReactNode } from "react";

import guided from "@/components/admin/AdminGuided.module.css";

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
  /** Optional fixed action area rendered below the scrolling panel content. */
  footer?: ReactNode;
  /** Optional classes for the animated, padded content container. */
  contentClassName?: string;
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
  footer,
  contentClassName,
  className,
}: AdminSidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
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
    const panel = panelRef.current;
    if (!panel) return;
    // iOS leaves the layout viewport/dvh tall while its software keyboard
    // reduces the visual viewport. Keep the entire panel (including optional
    // fixed actions) inside that visible area without moving or stealing focus.
    const viewport = window.visualViewport;
    let visibilityFrame: number | undefined;
    const update = () => {
      panel.style.setProperty(
        "--admin-panel-visible-height",
        String(viewport?.height || window.innerHeight) + "px",
      );
      panel.style.setProperty(
        "--admin-panel-visible-top",
        String(Math.max(0, viewport?.offsetTop || 0)) + "px",
      );
      if (visibilityFrame !== undefined) cancelAnimationFrame(visibilityFrame);
      visibilityFrame = requestAnimationFrame(() => {
        visibilityFrame = undefined;
        const content = scrollContentRef.current;
        const focused = document.activeElement;
        if (
          !content ||
          !(focused instanceof HTMLElement) ||
          !content.contains(focused) ||
          !focused.matches("input, textarea, select, [contenteditable='true']")
        ) return;
        // Wait for the viewport-sized panel to lay out, then move only its
        // scrolling body. Safari's earlier focus scroll may have used the old
        // height; scrollIntoView could also pan the page/visual viewport.
        const bodyBounds = content.getBoundingClientRect();
        const fieldBounds = focused.getBoundingClientRect();
        const visibleTop = bodyBounds.top + 8;
        const visibleBottom = bodyBounds.bottom - 8;
        if (fieldBounds.top < visibleTop) {
          content.scrollTop += fieldBounds.top - visibleTop;
        } else if (fieldBounds.bottom > visibleBottom) {
          content.scrollTop += fieldBounds.bottom - visibleBottom;
        }
      });
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      if (visibilityFrame !== undefined) cancelAnimationFrame(visibilityFrame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
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
          "fixed inset-y-0 right-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-md flex-col overflow-hidden border-l border-border bg-card text-card-foreground shadow-xl outline-none",
          guided.sidePanel,
          className,
        )}
      >
        <div className={cn("flex flex-none items-start justify-between gap-4 border-b border-border px-5 py-4 [padding-left:max(1.25rem,env(safe-area-inset-left))] [padding-right:max(1.25rem,env(safe-area-inset-right))] [padding-top:max(1rem,env(safe-area-inset-top))]", guided.sidePanelHeader)}>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-6 text-foreground">{title}</h2>
            {description && (
              <p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div ref={scrollContentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <SlidingPanel
            activeKey={activeKey}
            direction={direction}
            className={cn(
              "p-5 [padding-left:max(1.25rem,env(safe-area-inset-left))] [padding-right:max(1.25rem,env(safe-area-inset-right))]",
              guided.sidePanelContent,
              contentClassName,
            )}
          >
            {children}
          </SlidingPanel>
        </div>
        {footer && (
          <div className={"flex-none border-t border-border bg-card px-5 py-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] [padding-left:max(1.25rem,env(safe-area-inset-left))] [padding-right:max(1.25rem,env(safe-area-inset-right))] " + guided.sidePanelFooter}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
