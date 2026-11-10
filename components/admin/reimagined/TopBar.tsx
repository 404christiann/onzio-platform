"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "@/components/admin/icons";
import styles from "./frame.module.css";

// ADMIN-RE-24: the slim page bar over every reimagined admin page that is not a
// tab's own page: "‹ <tab>" back to that tab, the page's title, and an actions
// slot a page can fill with <TopBarActions>. (It replaces RE-05's "‹ Home".) A
// page with its own bar (the website editor's edit bar, Your club) takes the
// whole bar over with <TopBarTakeover>, and reads where "back" goes with
// useTabBack(). A page with unsaved work registers useLeaveGuard so the tabs ask
// it before they navigate away.

export type TabBack = Readonly<{ href: `/admin${string}`; label: string }>;

type LeaveGuard = (href: string) => void;
type GuardEntry = { leave: LeaveGuard; unsaved: boolean };

type TopBarSlot = {
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
  takeover: HTMLElement | null;
  setTakeover: (element: HTMLElement | null) => void;
  takenOver: boolean;
  setTakenOver: (takenOver: boolean) => void;
  back: TabBack;
  guard: React.MutableRefObject<GuardEntry | null>;
};

const NOOP = () => undefined;
const HOME_BACK: TabBack = { href: "/admin", label: "Home" };
const TopBarSlotContext = createContext<TopBarSlot>({
  slot: null,
  setSlot: NOOP,
  takeover: null,
  setTakeover: NOOP,
  takenOver: false,
  setTakenOver: NOOP,
  back: HOME_BACK,
  guard: { current: null },
});

export function TopBarActionsProvider({
  back = HOME_BACK,
  children,
}: {
  back?: TabBack;
  children: React.ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [takeover, setTakeover] = useState<HTMLElement | null>(null);
  const [takenOver, setTakenOver] = useState(false);
  const guard = useRef<GuardEntry | null>(null);
  const value = useMemo(
    () => ({ slot, setSlot, takeover, setTakeover, takenOver, setTakenOver, back, guard }),
    [slot, takeover, takenOver, back],
  );
  return <TopBarSlotContext.Provider value={value}>{children}</TopBarSlotContext.Provider>;
}

/** The top bar's actions area, or null outside the reimagined shell. */
export function useTopBarActions(): HTMLElement | null {
  return useContext(TopBarSlotContext).slot;
}

/**
 * True while a page's own bar has taken over (an editor). The frame then hides
 * the phone tab bar so the editor's own bottom tools are not covered; the
 * page's back link is the way out.
 */
export function useTopBarTakenOver(): boolean {
  return useContext(TopBarSlotContext).takenOver;
}

/** Where "‹ back" goes from this page: its tab, or Home. */
export function useTabBack(): TabBack {
  return useContext(TopBarSlotContext).back;
}

/**
 * While `onLeave` is set, a tab or sidebar link calls it with its address
 * instead of navigating, so a page can ask first or tidy up before it goes.
 * `unsaved` says whether leaving now would lose changes (Sign out asks first
 * when it would). Pass null for `onLeave` when the page needs neither.
 */
export function useLeaveGuard(onLeave: LeaveGuard | null, unsaved = onLeave !== null) {
  const { guard } = useContext(TopBarSlotContext);
  const latest = useRef(onLeave);
  latest.current = onLeave;
  const active = onLeave !== null;
  useEffect(() => {
    if (!active) return;
    const entry: GuardEntry = { leave: (href) => latest.current?.(href), unsaved };
    guard.current = entry;
    return () => {
      if (guard.current === entry) guard.current = null;
    };
  }, [active, unsaved, guard]);
}

/** For the shell's links: true when a page took the click to handle leaving itself. */
export function useLeaveCheck(): (href: string) => boolean {
  const { guard } = useContext(TopBarSlotContext);
  return (href) => {
    if (!guard.current) return false;
    guard.current.leave(href);
    return true;
  };
}

/** True when the page says leaving now would lose changes. */
export function useHasUnsaved(): () => boolean {
  const { guard } = useContext(TopBarSlotContext);
  return () => guard.current?.unsaved === true;
}

/** Puts its children into the top bar's actions slot. Renders nothing in the classic admin. */
export function TopBarActions({ children }: { children: React.ReactNode }) {
  const slot = useTopBarActions();
  return slot ? createPortal(children, slot) : null;
}

/**
 * Replaces the whole page bar (the back link, title and actions) with its
 * children while it is mounted. Renders nothing in the classic admin.
 */
export function TopBarTakeover({ children }: { children: React.ReactNode }) {
  const { takeover, setTakenOver } = useContext(TopBarSlotContext);
  useEffect(() => {
    setTakenOver(true);
    return () => setTakenOver(false);
  }, [setTakenOver]);
  return takeover ? createPortal(children, takeover) : null;
}

/** A plain left click, which a guard may take over; modified clicks open as usual. */
export function isPlainClick(event: React.MouseEvent) {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);
}

export function TopBar({ title }: { title: string }) {
  const { setSlot, setTakeover, takenOver, back } = useContext(TopBarSlotContext);
  const leave = useLeaveCheck();
  if (takenOver) {
    return (
      <header className={styles.pageBar} data-takeover="">
        <div ref={setTakeover} className={styles.takeover} />
      </header>
    );
  }
  return (
    <header className={styles.pageBar}>
      <Link
        href={back.href}
        className={`${styles.back} ${styles.press}`}
        onClick={(event) => {
          if (isPlainClick(event) && leave(back.href)) event.preventDefault();
        }}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        {back.label}
      </Link>
      <p className={styles.pageTitle} title={title} data-testid="admin-top-bar-title">
        {title}
      </p>
      <div ref={setSlot} className={styles.actions} />
    </header>
  );
}
