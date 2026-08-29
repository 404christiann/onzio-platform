"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * AdminSectionRail — vertical section-rail primitive.
 *
 * Renders a vertical list of section rows meant to sit in a narrow left
 * column next to a wider content panel (the intended consumer layout is a
 * two-column grid such as `grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]`
 * on `sm:` and up, stacking to a single column below that — the rail
 * itself only renders the column contents, it does not impose the grid on
 * its consumer).
 *
 * Intended future consumers: Homepage, Programs, Tryouts, Shop, About, and
 * Sponsors admin pages, replacing their "pills packed in a narrow column"
 * section pickers with this shared primitive.
 *
 * Active-row semantics use `aria-current="page"`, matching the convention
 * already used by nav-style active-link indicators elsewhere in this
 * codebase (see components/pathway/PathwayNav.tsx).
 *
 * ```tsx
 * <div className="grid gap-6 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
 *   <AdminSectionRail items={sections} value={activeId} onChange={setActiveId} />
 *   <AdminPanel>...</AdminPanel>
 * </div>
 * ```
 */

export type AdminSectionRailItem = {
  id: string;
  label: string;
  /** Shows a small amber dirty-indicator dot next to the label when true. */
  dirty?: boolean;
  /** Shows a small destructive dot when true, for a save-blocking validation issue. */
  invalid?: boolean;
  /** Optional trailing item count, e.g. "3/6". */
  count?: string;
  /** Optional small tag rendered below the label, e.g. "Shop Page only". */
  tag?: string;
  /** When true, the row is skipped entirely from rendering (not just visually hidden). */
  hidden?: boolean;
};

type AdminSectionRailProps = {
  items: readonly AdminSectionRailItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
};

export function AdminSectionRail({
  items,
  value,
  onChange,
  className,
}: AdminSectionRailProps) {
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  // Hidden items never enter the DOM, matching the "never let hidden
  // routes/fields leak" pattern used by lib/admin-route-manifest.ts.
  const visibleItems = items.filter((item) => !item.hidden);

  function focusAndSelect(id: string) {
    onChange(id);
    rowRefs.current.get(id)?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        nextIndex = (index + 1) % visibleItems.length;
        break;
      case "ArrowUp":
        nextIndex = (index - 1 + visibleItems.length) % visibleItems.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = visibleItems.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = visibleItems[nextIndex];
    if (next) focusAndSelect(next.id);
  }

  return (
    <nav
      aria-label="Sections"
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card p-2 text-card-foreground shadow-sm",
        className,
      )}
    >
      {visibleItems.map((item, index) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) rowRefs.current.set(item.id, node);
              else rowRefs.current.delete(item.id);
            }}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "flex min-h-10 flex-col gap-0.5 rounded-lg px-3 py-1.5 text-left text-sm font-medium transition",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{item.label}</span>
                  {item.dirty && (
                    <span
                      aria-label="Unsaved changes"
                      title="Unsaved changes"
                      className="h-1.5 w-1.5 flex-none rounded-full bg-warning"
                    />
                  )}
                </span>
                {item.count && (
                  <span
                    className={cn(
                      "text-xs font-normal",
                      item.invalid ? "text-destructive" : "opacity-70",
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </span>
              {item.invalid && (
                <span
                  aria-label="Needs attention"
                  title="Needs attention"
                  className="h-2 w-2 flex-none rounded-full bg-destructive"
                />
              )}
            </span>
            {item.tag && (
              <span className="font-display w-fit rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {item.tag}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
