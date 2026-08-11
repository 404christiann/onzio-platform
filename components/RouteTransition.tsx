"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Shared route-level page transition (public site + admin), locked via a
// /grill-me interview with Christian on 2026-08-10: fade + slight rise
// (~200ms, no directional slide since pages aren't spatially related),
// plays on every navigation. The delayed indicator only appears past
// INDICATOR_DELAY_MS so fast/prefetched navigations show pure motion with
// no spinner flash. Reduced-motion collapses this to an instant swap.
// Scope is route changes only — SlidingPanel, the Club dropdown, and the
// public site's gsap scroll animations are untouched.
//
// Not built on useLinkStatus(): its context is provided inside <Link>, so
// it only works in descendants of one. Using it would mean touching every
// <Link> in Nav.tsx/AdminShell.tsx/Footer.tsx, which contract tests pin as
// literal source text — so the pending signal is derived at the layout
// level instead (see useDelayedNavigationIndicator below).

/** Rise distance for the entering page. Spec: ~8-12px. */
const RISE_PX = 10;

/** Entering page: the "~200ms, snappy" figure from the interview. */
const ENTER_SECONDS = 0.2;

/**
 * Outgoing page. Shorter than the entrance on purpose: `mode="wait"` runs exit
 * and enter back to back, so a symmetric 200ms exit would make every
 * navigation read as ~400ms and undercut "never feels like it's slowing
 * navigation down". The exit only has to register as a fade, not be admired.
 */
const EXIT_SECONDS = 0.12;

/**
 * How long a navigation may take before the loading indicator is allowed to
 * appear. Spec: ~150-200ms. Below this, the user only ever sees the fade+rise.
 */
const INDICATOR_DELAY_MS = 180;

/**
 * Hard ceiling on a visible indicator. Nothing should keep it up this long --
 * this only exists so a navigation that never commits (a click another handler
 * cancelled after we had already started counting) cannot strand a spinner
 * on screen indefinitely.
 */
const INDICATOR_MAX_MS = 8000;

/**
 * Standard easing for entering UI. Same curve already used by
 * `components/admin/payments/PaymentStatusCard.tsx`'s count-up animation.
 */
const ENTER_EASE = [0.22, 1, 0.36, 1] as const;

// Returns true once a navigation has been pending past INDICATOR_DELAY_MS.
// Start: a capture-phase click listener on document — capture is required
// because <Link> calls preventDefault() in its own bubble-phase handler, so
// defaultPrevented is useless by the time it reaches us here; the same
// conditions Next itself uses to decide on a client navigation are applied
// (primary button, no modifiers, same-origin, not a new tab/download/hash,
// actually a different path). End: usePathname() changing — there are no
// loading.tsx boundaries in this app, so the router holds the current page
// until the destination has actually rendered.
function useDelayedNavigationIndicator(pathname: string): boolean {
  const [visible, setVisible] = useState(false);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }

  // The destination committed (or the user navigated back/forward): stop
  // counting and take the indicator down.
  useEffect(() => {
    clearTimers();
    setVisible(false);
  }, [pathname]);

  useEffect(() => {
    function onClickCapture(event: MouseEvent) {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("#")) return;

      let destination: URL;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      // Same route: no page swap is coming, so no indicator.
      if (destination.pathname === window.location.pathname) return;

      clearTimers();
      timers.current.push(
        window.setTimeout(() => setVisible(true), INDICATOR_DELAY_MS),
        window.setTimeout(() => {
          clearTimers();
          setVisible(false);
        }, INDICATOR_MAX_MS),
      );
    }

    document.addEventListener("click", onClickCapture, true);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      clearTimers();
    };
  }, []);

  return visible;
}

type RouteTransitionProps = {
  /**
   * Surface-specific loading indicator, rendered centred and above the page
   * only once a navigation has been pending past `INDICATOR_DELAY_MS`. The
   * admin portal passes its existing `AdminLoading`; the public site passes
   * `SiteLoading`, which resolves its own per-template accent.
   */
  indicator: ReactNode;
  children: ReactNode;
};

export default function RouteTransition({
  indicator,
  children,
}: RouteTransitionProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const showIndicator = useDelayedNavigationIndicator(pathname);

  // DOM structure stays identical either way (durations just collapse to 0)
  // since useReducedMotion() resolves client-side — branching the tree
  // instead would risk a hydration mismatch.
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          data-route-transition-page="true"
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: RISE_PX }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          // Exit is opacity-only -- "fades out in place", no rise -- and
          // carries its own shorter duration.
          exit={
            reduceMotion
              ? { opacity: 1, transition: { duration: 0 } }
              : { opacity: 0, transition: { duration: EXIT_SECONDS } }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  opacity: { duration: ENTER_SECONDS, ease: "easeOut" },
                  y: { duration: ENTER_SECONDS, ease: ENTER_EASE },
                }
          }
        >
          {children}
        </motion.div>
      </AnimatePresence>

      {showIndicator ? (
        <div
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
          data-route-transition-indicator="true"
        >
          {indicator}
        </div>
      ) : null}
    </>
  );
}
