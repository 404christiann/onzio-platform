"use client";

import { useAdminPortal } from "@/components/admin/AdminPortalProvider";

// ADMIN-RE-05: /admin's loading state follows the club's admin, so a club on
// the reimagined admin never sees the classic dashboard's placeholders.
export function HomeFallback({
  classic,
  reimagined,
}: {
  classic: React.ReactNode;
  reimagined: React.ReactNode;
}) {
  return <>{useAdminPortal().portal === "reimagined" ? reimagined : classic}</>;
}
