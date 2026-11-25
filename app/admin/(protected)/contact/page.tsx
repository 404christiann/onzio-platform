"use client";

import ClassicContactEditor from "@/components/admin/contact/ClassicContactEditor";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { useClubContext } from "@/components/ClubContextProvider";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import CinematicContactEditor from "@/components/admin/contact/CinematicContactEditor";

export default function AdminContactPage() {
  const club = useClubContext();
  if (club.presentationTemplateKey === "cinematic@2") return <CinematicContactEditor />;
  if (!codeSiteAdminFor(club)?.contact.routeVisible) {

    return <AdminPage><AdminPageHeader eyebrow="Public website" title="Contact" description="This website design does not publish a Contact page." /></AdminPage>;
  }
  return <ClassicContactEditor />;
}
