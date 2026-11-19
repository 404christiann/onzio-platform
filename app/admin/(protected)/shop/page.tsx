"use client";

import ShopPageEditor from "@/components/admin/shop/ShopPageEditor";
import ClassicShopPageEditor from "@/components/admin/shop/ClassicShopPageEditor";
import RoseCityShopEditor from "@/components/admin/shop/rose-city/RoseCityShopEditor";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { useClubContext } from "@/components/ClubContextProvider";

export default function AdminShopPage() {
  const club = useClubContext();
  const portal = useAdminPortal().portal;
  // cinematic@2 (Rose City) carries its own shop sections. In the classic admin it gets the
  // Both kits editor; the reimagined admin keeps ShopPageEditor, and every other design is unchanged.
  const editor = portal === "classic" ? (club.presentationTemplateKey === "cinematic@2" ? "bothKits" : "classic") : "legacy";
  if (editor === "bothKits") return <RoseCityShopEditor />;
  return editor === "classic" ? <ClassicShopPageEditor /> : <ShopPageEditor />;
}
