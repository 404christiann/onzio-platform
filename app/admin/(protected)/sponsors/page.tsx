"use client";

import Link from "next/link";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPanel } from "@/components/admin/AdminPage";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { Sponsors } from "@/components/admin/reimagined/Sponsors";
import { ClassicSponsorsPage } from "@/components/admin/sponsors/ClassicSponsorsPage";
import RoseCitySponsorsEditor from "@/components/admin/sponsors/rose-city/RoseCitySponsorsEditor";

// ADMIN-RE-15: a club on the new admin gets the one-list page (design
// cd-sponsors-final, decision 0007); a classic club keeps this page, which edits
// the same rows one place at a time.
export default function AdminSponsorsPage() {
  const { portal } = useAdminPortal();
  const club = useClubContext();
  const page = portal === "reimagined" ? <Sponsors /> : <ClassicSponsorsPage />;
  if (club.presentationTemplateKey !== "cinematic@2") return page;
  // RC-ADMIN-14: Rose City in the classic admin gets the Previews editor, which carries its own partner-list link.
  if (portal === "classic") return <RoseCitySponsorsEditor />;
  // Rose City (cinematic@2): its Club Partners pages keep their own partner list.
  return (
    <>
      <AdminPage className="mb-6">
        <AdminPanel className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <p className="font-body text-sm text-muted-foreground">
            The Club Partners and Partnership Opportunities pages have their own partner list. They can reuse these logos.
          </p>
          <Link href="/admin/partners" className="font-body text-sm font-semibold text-primary underline">
            Edit Partners pages
          </Link>
        </AdminPanel>
      </AdminPage>
      {page}
    </>
  );
}
