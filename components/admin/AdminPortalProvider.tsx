"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  CLASSIC_ADMIN_PORTAL,
  type AdminPortalSettings,
} from "@/lib/admin-portal";
import { isValidTimeZone } from "@/lib/club-time";
import { ClubTimeZoneProvider } from "@/components/ClubTimeZoneProvider";

// ADMIN-RE-02: the club's admin switch, slice flags and time zone for every
// admin page. Outside the provider (or before RE-05 renders anything from it)
// the classic admin's values apply.

const AdminPortalContext = createContext<AdminPortalSettings>(CLASSIC_ADMIN_PORTAL);

export function useAdminPortal(): AdminPortalSettings {
  return useContext(AdminPortalContext);
}

function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

export function AdminPortalProvider({
  children,
  settings,
  isOwner,
}: {
  children: React.ReactNode;
  settings: AdminPortalSettings;
  isOwner: boolean;
}) {
  const [current, setCurrent] = useState(settings);
  const sent = useRef(false);

  useEffect(() => {
    setCurrent(settings);
  }, [settings]);

  // Decision 1: nobody types a time zone. The first owner visit sends the
  // browser's, and the server keeps it only while none is confirmed yet.
  useEffect(() => {
    if (!isOwner || settings.timeZoneConfirmed || sent.current) return;
    const timeZone = browserTimeZone();
    if (!timeZone) return;
    sent.current = true;
    void fetch("/api/admin/club-time-zone", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as { timeZone?: unknown };
        if (isValidTimeZone(result.timeZone)) {
          const saved = result.timeZone;
          setCurrent((previous) => ({ ...previous, timeZone: saved, timeZoneConfirmed: true }));
        }
      })
      .catch(() => undefined);
  }, [isOwner, settings.timeZoneConfirmed]);

  // ADMIN-RE-03: admin pages and the previews they render (NextMatchCard,
  // AcademyNextMatch) read the club's zone through useClubTimeZone().
  return (
    <AdminPortalContext.Provider value={current}>
      <ClubTimeZoneProvider timeZone={current.timeZone}>{children}</ClubTimeZoneProvider>
    </AdminPortalContext.Provider>
  );
}
