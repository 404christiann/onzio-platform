"use client";

import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { useClubContext } from "@/components/ClubContextProvider";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import ClassicTryoutsPageEditor from "./ClassicTryoutsPageEditor";

export default function TryoutsPageEditor() {
  const club = useClubContext();
  const policy = codeSiteAdminFor(club)?.tryouts;
  if (!policy?.routeVisible) {
    return <AdminPage><AdminPageHeader eyebrow="Public website" title="Tryouts"
      description="This website design does not publish a Tryouts page." />
      <p className="rounded-xl border border-border bg-card p-6 font-body text-sm text-muted-foreground">Choose a supported website design before editing a public Tryouts page.</p>
    </AdminPage>;
  }
  return <ClassicTryoutsPageEditor policy={policy} />;
}
