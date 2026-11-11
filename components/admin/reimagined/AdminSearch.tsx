"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  IconEdit,
  IconSchedule,
  IconSearch,
  IconSeasonStats,
  IconStandings,
  IconUser,
  type AdminIconComponent,
} from "@/components/admin/icons";
import { plainFilter, searchWords, type AdminSearchGroup, type AdminSearchIcon, type AdminSearchItem } from "@/lib/admin-search";
import { ROUTE_ICONS } from "./MoreList";
import { TAB_ICONS } from "./tabIcons";
import styles from "./search.module.css";

// ADMIN-RE-24c: search (design: admin-plain-search-two-clubs.html). cmdk inside
// a Base UI Dialog (modal="trap-focus"), with cmdk's fuzzy filter replaced by
// plainFilter (word starts first, no fuzzy matching). It opens instantly, from
// the sidebar's box or ⌘K on a laptop and the magnifier on a phone; the query
// resets on close. The list comes from the server and holds only what the
// person can open.

const GROUPS: readonly AdminSearchGroup[] = ["Jobs", "Pages", "Players", "Games"];

const JOB_ICONS = {
  "enter-score": IconStandings,
  "add-game": IconSchedule,
  "see-registrations": IconSeasonStats,
  "edit-website": IconEdit,
} as const;

function iconFor(icon: AdminSearchIcon): AdminIconComponent {
  switch (icon.kind) {
    case "job":
      return JOB_ICONS[icon.id];
    case "tab":
      return TAB_ICONS[icon.id][0];
    case "route":
      return ROUTE_ICONS[icon.id];
    case "player":
      return IconUser;
    case "game":
      return IconSchedule;
  }
}

/** The sidebar's search box (laptop). */
export function SearchBox({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={`${styles.box} ${styles.press}`} onClick={onOpen} aria-haspopup="dialog" data-testid="admin-search-box">
      <IconSearch aria-hidden="true" />
      <span>Search</span>
      <kbd aria-hidden="true">⌘K</kbd>
    </button>
  );
}

/** The phone top bar's magnifier. */
export function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.iconButton} ${styles.press}`}
      onClick={onOpen}
      aria-label="Search pages and jobs"
      aria-haspopup="dialog"
      data-testid="admin-search-button"
    >
      <IconSearch aria-hidden="true" />
    </button>
  );
}

/** ⌘K / Ctrl+K opens search from anywhere in the new admin. */
export function useSearchShortcut(open: () => void) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

export function SearchDialog({
  items,
  open,
  onOpenChange,
  onNavigate,
}: {
  items: readonly AdminSearchItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Goes to a result the same way a tab does, so a page with unsaved changes
   * can ask first (bot Medium on #132). Defaults to a plain navigation.
   */
  onNavigate?: (href: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".admin-portal"));
  }, []);
  const grouped = useMemo(
    () => GROUPS.map((group) => [group, items.filter((item) => item.group === group)] as const).filter(([, list]) => list.length),
    [items],
  );

  const change = (next: boolean) => {
    onOpenChange(next);
    if (!next) setQuery("");
  };
  const go = (item: AdminSearchItem) => {
    change(false);
    if (onNavigate) onNavigate(item.href);
    else router.push(item.href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={change} modal="trap-focus">
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.palette} aria-label="Search pages and jobs" data-testid="admin-search">
          <Command label="Search pages and jobs" filter={plainFilter} loop>
            <div className={styles.inputRow}>
              <IconSearch aria-hidden="true" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search pages, jobs, players and games"
                autoFocus
                className={styles.input}
              />
              <Dialog.Close className={`${styles.cancel} ${styles.press}`}>
                <span className={styles.phoneOnly}>Cancel</span>
                <span className={styles.laptopOnly} aria-hidden="true">
                  esc
                </span>
                <span className={styles.srOnly}>Close search</span>
              </Dialog.Close>
            </div>
            <Command.List className={styles.list}>
              <Command.Empty className={styles.empty}>Nothing matches. Try a page name, like “roster”.</Command.Empty>
              {grouped.map(([group, list]) => (
                <Command.Group key={group} heading={group} className={styles.group}>
                  {list.map((item) => {
                    const Icon = iconFor(item.icon);
                    return (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        keywords={searchWords(item)}
                        onSelect={() => go(item)}
                        className={styles.item}
                        data-search-item={item.id}
                      >
                        <Icon aria-hidden="true" />
                        <span className={styles.label}>{item.label}</span>
                        {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
