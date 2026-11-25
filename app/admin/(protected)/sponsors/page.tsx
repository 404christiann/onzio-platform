"use client";

import { useClubContext } from "@/components/ClubContextProvider";
import { ClassicSponsorsPage } from "@/components/admin/sponsors/ClassicSponsorsPage";
import RoseCitySponsorsEditor from "@/components/admin/sponsors/rose-city/RoseCitySponsorsEditor";

export default function AdminSponsorsPage() {
  const club = useClubContext();
  // RC-ADMIN-14: Rose City gets the Previews editor, which carries its own partner-list link.
  if (club.presentationTemplateKey === "cinematic@2") return <RoseCitySponsorsEditor />;
  return <ClassicSponsorsPage />;
}
