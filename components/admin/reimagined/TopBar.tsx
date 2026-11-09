"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "@/components/admin/icons";
import styles from "./reimagined.module.css";

// ADMIN-RE-05: the slim bar on every reimagined admin page except the home:
// "‹ Home", the page's title, and an actions slot a page can fill with
// <TopBarActions>. On the home it carries only the account menu. A page with its
// own bar (the website editor's edit bar, ADMIN-RE-09) can take the whole bar
// over with <TopBarTakeover>.

type TopBarSlot = {
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
  takeover: HTMLElement | null;
  setTakeover: (element: HTMLElement | null) => void;
  takenOver: boolean;
  setTakenOver: (takenOver: boolean) => void;
};

const NOOP = () => undefined;
const TopBarSlotContext = createContext<TopBarSlot>({
  slot: null,
  setSlot: NOOP,
  takeover: null,
  setTakeover: NOOP,
  takenOver: false,
  setTakenOver: NOOP,
});

export function TopBarActionsProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [takeover, setTakeover] = useState<HTMLElement | null>(null);
  const [takenOver, setTakenOver] = useState(false);
  const value = useMemo(
    () => ({ slot, setSlot, takeover, setTakeover, takenOver, setTakenOver }),
    [slot, takeover, takenOver],
  );
  return <TopBarSlotContext.Provider value={value}>{children}</TopBarSlotContext.Provider>;
}

/** The top bar's actions area, or null outside the reimagined shell. */
export function useTopBarActions(): HTMLElement | null {
  return useContext(TopBarSlotContext).slot;
}

/** Puts its children into the top bar's actions slot. Renders nothing in the classic admin. */
export function TopBarActions({ children }: { children: React.ReactNode }) {
  const slot = useTopBarActions();
  return slot ? createPortal(children, slot) : null;
}

/**
 * Replaces the whole top bar (the "‹ Home" link, title, actions and account
 * menu) with its children while it is mounted. Renders nothing in the classic admin.
 */
export function TopBarTakeover({ children }: { children: React.ReactNode }) {
  const { takeover, setTakenOver } = useContext(TopBarSlotContext);
  useEffect(() => {
    setTakenOver(true);
    return () => setTakenOver(false);
  }, [setTakenOver]);
  return takeover ? createPortal(children, takeover) : null;
}

export function TopBar({
  home,
  title,
  account,
}: {
  home: boolean;
  title: string;
  account: React.ReactNode;
}) {
  const { setSlot, setTakeover, takenOver } = useContext(TopBarSlotContext);
  if (takenOver) {
    return (
      <header className={styles.topBar} data-takeover="">
        <div ref={setTakeover} className={styles.takeover} />
      </header>
    );
  }
  return (
    <header className={styles.topBar} data-home={home || undefined}>
      {home ? (
        <span className={styles.spacer} />
      ) : (
        <>
          <Link href="/admin" className={styles.back}>
            <ChevronLeft className="size-5" aria-hidden="true" />
            Home
          </Link>
          <p className={styles.title} title={title} data-testid="admin-top-bar-title">
            {title}
          </p>
        </>
      )}
      <div ref={setSlot} className={styles.actions} />
      {account}
    </header>
  );
}
