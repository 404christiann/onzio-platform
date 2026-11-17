"use client";

import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { Sponsors } from "@/components/admin/reimagined/Sponsors";
import { ClassicSponsorsPage } from "@/components/admin/sponsors/ClassicSponsorsPage";

// ADMIN-RE-15: a club on the new admin gets the one-list page (design
// cd-sponsors-final, decision 0007); a classic club keeps this page, which edits
// the same rows one place at a time.
export default function AdminSponsorsPage() {
  const { portal } = useAdminPortal();
  return portal === "reimagined" ? <Sponsors /> : <ClassicSponsorsPage />;
}
