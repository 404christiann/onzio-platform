"use client";

import { createContext, useContext, useLayoutEffect } from "react";

/**
 * The shell provides this so a page that renders a PageFrame can tell it the page now
 * has its own Breadcrumb landmark. The shell then shows its top-bar trail as plain text,
 * so a screen reader hears the trail once. A page without a PageFrame never registers,
 * and the shell's top-bar breadcrumb is unchanged.
 */
export const PageFrameRegistryContext = createContext<((active: boolean) => void) | null>(null);

export function useRegisterPageFrame() {
  const register = useContext(PageFrameRegistryContext);
  useLayoutEffect(() => {
    register?.(true);
    return () => register?.(false);
  }, [register]);
}
