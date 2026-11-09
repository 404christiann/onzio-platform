"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "@/components/admin/icons";
import styles from "./reimagined.module.css";

// ADMIN-RE-05: the slim bar on every reimagined admin page except the home:
// "‹ Home", the page's title, and an actions slot a page can fill with
// <TopBarActions>. On the home it carries only the account menu.

type TopBarSlot = {
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
};

const TopBarSlotContext = createContext<TopBarSlot>({ slot: null, setSlot: () => undefined });

export function TopBarActionsProvider({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
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

export function TopBar({
  home,
  title,
  account,
}: {
  home: boolean;
  title: string;
  account: React.ReactNode;
}) {
  const { setSlot } = useContext(TopBarSlotContext);
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
