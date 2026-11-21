"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// TELEMETRY-01: sends one cookieless "view" beacon per page, including
// client-side navigations. The server derives everything else (visitor id,
// device, geography, staff) and drops bots; see app/api/t/route.ts.

export const BEACON_URL = "/api/t";

function send(body: string): void {
  try {
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(BEACON_URL, body)) {
      return;
    }
    void fetch(BEACON_URL, {
      method: "POST",
      body,
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    }).catch(() => undefined);
  } catch {
    // Telemetry never breaks a page.
  }
}

export default function PageBeacon() {
  const pathname = usePathname();
  const last = useRef<{ path: string; href: string } | null>(null);

  useEffect(() => {
    if (!pathname || last.current?.path === pathname) return;
    // The first view reports the real referrer; later client-side
    // navigations report the previous page, which the server marks internal.
    const referrer = last.current ? last.current.href : document.referrer;
    last.current = { path: pathname, href: window.location.href };
    send(
      JSON.stringify({
        t: "view",
        p: window.location.pathname,
        r: referrer.slice(0, 2048),
        q: window.location.search.slice(0, 2048),
      }),
    );
  }, [pathname]);

  return null;
}
