"use client";

import ClassicShopPageEditor from "@/components/admin/shop/ClassicShopPageEditor";
import RoseCityShopEditor from "@/components/admin/shop/rose-city/RoseCityShopEditor";
import { useClubContext } from "@/components/ClubContextProvider";

export default function AdminShopPage() {
  const club = useClubContext();
  // cinematic@2 (Rose City) carries its own shop sections and gets the Both kits editor.
  if (club.presentationTemplateKey === "cinematic@2") return <RoseCityShopEditor />;
  return <ClassicShopPageEditor />;
}
