"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * AdminTabs — controlled segmented-tab primitive.
 *
 * Generalizes the hand-rolled "Forms / Archived" segmented control from
 * app/admin/(protected)/registrations/page.tsx into a reusable component:
 * a rounded-lg bordered track (`bg-muted/50 p-1`) holding `role="tab"`
 * buttons, with the active tab getting `bg-card shadow-sm`.
 *
 * This component only renders the tab list. It does not render or manage
 * any panel content — pair each tab with a panel by giving the panel
 * `id={`${tabsId}-panel-${item.id}`}` and `aria-labelledby={`${tabsId}-tab-${item.id}`}`,
 * matching the `id`/`aria-controls` pair each tab already exposes:
 *
 * ```tsx
 * const [view, setView] = useState("active");
 * <AdminTabs
 *   items={[
 *     { id: "active", label: "Forms", badge: activeCount },
 *     { id: "archived", label: "Archived", badge: archivedCount },
 *   ]}
 *   value={view}
 *   onChange={setView}
 * />
 * <div
 *   id="forms-tabs-panel-active"
 *   role="tabpanel"
 *   aria-labelledby="forms-tabs-tab-active"
 *   hidden={view !== "active"}
 * >
 *   ...
 * </div>
 * ```
 *
 * Keyboard behavior follows the standard WAI-ARIA tablist pattern:
 * ArrowLeft/ArrowRight move focus (and selection) between enabled tabs,
 * wrapping at the ends; Home/End jump to the first/last enabled tab.
 */

export type AdminTabItem = {
  id: string;
  label: string;
  badge?: string | number;
  disabled?: boolean;
};

type AdminTabsProps = {
  items: readonly AdminTabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Unique id prefix used to derive each tab's `id`/`aria-controls`. Defaults to "admin-tabs". */
  tabsId?: string;
  /** Accessible label for the tablist container, e.g. "Registration form views". */
  label?: string;
  className?: string;
};

export function AdminTabs({
  items,
  value,
  onChange,
  tabsId = "admin-tabs",
  label,
  className,
}: AdminTabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const enabledItems = items.filter((item) => !item.disabled);

  function focusAndSelect(id: string) {
    onChange(id);
    tabRefs.current.get(id)?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabledIndex = enabledItems.findIndex((item) => item.id === items[index]?.id);
    if (enabledIndex === -1) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (enabledIndex + 1) % enabledItems.length;
        break;
      case "ArrowLeft":
        nextIndex = (enabledIndex - 1 + enabledItems.length) % enabledItems.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = enabledItems.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = enabledItems[nextIndex];
    if (next) focusAndSelect(next.id);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex w-full rounded-lg border border-border bg-muted/50 p-1 sm:w-auto",
        className,
      )}
    >
      {items.map((item, index) => {
        const isSelected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) tabRefs.current.set(item.id, node);
              else tabRefs.current.delete(item.id);
            }}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${item.id}`}
            aria-controls={`${tabsId}-panel-${item.id}`}
            aria-selected={isSelected}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "min-h-11 flex-1 rounded-md px-3 text-sm font-semibold transition sm:flex-none",
              isSelected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              item.disabled && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
            )}
          >
            {item.label}
            {item.badge !== undefined && (
              <span
                className={cn(
                  "ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold",
                  isSelected
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
