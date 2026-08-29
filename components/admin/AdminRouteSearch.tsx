"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type AdminSearchRoute = {
  href: string;
  label: string;
  groupLabel?: string;
  keywords?: readonly string[];
};

export function AdminRouteSearch({ routes }: { routes: readonly AdminSearchRoute[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return routes;
    return routes.filter((route) =>
      [route.label, route.groupLabel, ...(route.keywords ?? [])]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalized)),
    );
  }, [query, routes]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById(`admin-search-result-${activeIndex}`)?.click();
    }
  }

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-md">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-left text-sm text-muted-foreground shadow-sm transition hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Search admin pages</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close route search"
            className="fixed inset-0 z-40 cursor-default bg-foreground/10 backdrop-blur-[1px]"
            onClick={() => close()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search admin pages"
            className="fixed left-4 right-4 top-20 z-50 mx-auto max-w-xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl sm:absolute sm:left-0 sm:right-auto sm:top-12 sm:w-[28rem]"
          >
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search pages and actions…"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls="admin-route-search-results"
                aria-activedescendant={results.length ? `admin-search-result-${activeIndex}` : undefined}
                className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => close()}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close route search"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <p className="sr-only" aria-live="polite">
              {results.length} {results.length === 1 ? "result" : "results"}
            </p>
            <div id="admin-route-search-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
              {results.length ? (
                results.map((route, index) => (
                  <Link
                    id={`admin-search-result-${index}`}
                    key={route.href}
                    href={route.href}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => close(false)}
                    className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-sm outline-none transition hover:bg-accent aria-selected:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-medium text-foreground">{route.label}</span>
                    {route.groupLabel ? (
                      <span className="text-xs text-muted-foreground">{route.groupLabel}</span>
                    ) : null}
                  </Link>
                ))
              ) : (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No accessible pages match your search.
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
