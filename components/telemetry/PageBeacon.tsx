"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { usePathname } from "next/navigation";
import { createHeartbeat, type Heartbeat } from "./heartbeat";
import { sendTelemetry } from "./send";

// TELEMETRY-01: sends one cookieless "view" beacon per page, including
// client-side navigations. The server derives everything else (visitor id,
// device, geography, staff) and drops bots; see app/api/t/route.ts.
// TELEMETRY-03: also reports how long each page stayed visible (heartbeat.ts).

// Called only from effects, never during render. The listener effect's cleanup
// drops the controller, so React's development remount builds a fresh one.
function ensureHeartbeat(ref: MutableRefObject<Heartbeat | null>): Heartbeat {
  return (ref.current ??= createHeartbeat({ hidden: document.hidden }));
}

export default function PageBeacon() {
  const pathname = usePathname();
  const last = useRef<{ path: string; href: string } | null>(null);
  const heartbeat = useRef<Heartbeat | null>(null);

  useEffect(() => {
    if (!pathname || last.current?.path === pathname) return;
    // The first view reports the real referrer; later client-side
    // navigations report the previous page, which the server marks internal.
    const referrer = last.current ? last.current.href : document.referrer;
    last.current = { path: pathname, href: window.location.href };
    // The previous page's last piece of time goes out first, under its own path.
    ensureHeartbeat(heartbeat).startView(window.location.pathname);
    sendTelemetry({
      t: "view",
      p: window.location.pathname,
      r: referrer.slice(0, 2048),
      q: window.location.search.slice(0, 2048),
    });
  }, [pathname]);

  useEffect(() => {
    const resumed = !heartbeat.current;
    const beat = ensureHeartbeat(heartbeat);
    // A remount (React development double effects) finds the view already
    // counted: keep timing it without sending a second "view".
    if (resumed && last.current) beat.startView(window.location.pathname);
    const onVisibility = () => beat.setHidden(document.hidden);
    const onPageHide = () => {
      beat.flush();
      beat.setHidden(true);
    };
    // The back/forward cache restores a page without a new "view"; resume timing.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) beat.setHidden(document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      beat.stop();
      heartbeat.current = null;
    };
  }, []);

  return null;
}
