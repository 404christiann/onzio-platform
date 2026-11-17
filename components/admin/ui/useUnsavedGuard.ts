"use client";

import { createContext, useContext, useEffect, useRef } from "react";

export type UnsavedGuardRegistration = {
  dirty: boolean;
  edited: string;
  onSave: () => Promise<boolean>;
  /** Read current retained work when an open guard rerenders after an attempt. */
  retentionNotice?: () => string | null;
  onDiscard?: () => void | Promise<void>;
};

export type UnsavedGuardTarget = {
  kind: "page" | "switch";
  label: string;
  continue: () => void;
  opener?: HTMLElement | null;
};

export type UnsavedGuardContextValue = {
  register: (read: () => UnsavedGuardRegistration | undefined) => () => void;
  requestNavigation: (target: UnsavedGuardTarget) => boolean;
};

export const UnsavedGuardContext = createContext<UnsavedGuardContextValue | null>(null);

export function useUnsavedGuard(registration?: UnsavedGuardRegistration) {
  const context = useContext(UnsavedGuardContext);
  if (!context) throw new Error("useUnsavedGuard requires the classic admin guard provider");

  const latest = useRef(registration);
  useEffect(() => {
    latest.current = registration;
  });

  const enabled = registration !== undefined;
  useEffect(() => {
    if (!enabled) return;
    return context.register(() => latest.current);
  }, [context, enabled]);

  return context.requestNavigation;
}

