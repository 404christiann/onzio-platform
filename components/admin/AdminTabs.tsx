"use client";

import { useLayoutEffect, useRef, useState } from "react";

import styles from "./AdminTabs.module.css";

import { cn } from "@/lib/utils";

/**
 * AdminTabs — controlled tablist primitive.
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
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    function measure() {
      const tab = tabRefs.current.get(value);
      if (!tab || !list) {
        setIndicator(null);
        return;
      }
      const left = tab.offsetLeft;
      const width = tab.offsetWidth;
      setIndicator((previous) =>
        previous?.left === left && previous.width === width ? previous : { left, width },
      );
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const tab of tabRefs.current.values()) observer.observe(tab);
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [items, value]);

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
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn(styles.list, className)}
      data-admin-tabs=""
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
            className={cn(styles.tab, item.disabled && styles.disabled)}
          >
            <span className={styles.label}>{item.label}</span>
            {item.badge !== undefined && (
              <span className={styles.badge}>{item.badge}</span>
            )}
          </button>
        );
      })}
      <span
        aria-hidden="true"
        data-admin-tab-indicator=""
        data-ready={ready}
        className={styles.indicator}
        style={{
          opacity: indicator ? 1 : 0,
          transform: indicator
            ? `translateX(${indicator.left}px) scaleX(${indicator.width / 100})`
            : "translateX(0) scaleX(0)",
        }}
      />
    </div>
  );
}
