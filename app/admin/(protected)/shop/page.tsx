"use client";

import ShopPageEditor from "@/components/admin/shop/ShopPageEditor";
import ClassicShopPageEditor from "@/components/admin/shop/ClassicShopPageEditor";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { useClubContext } from "@/components/ClubContextProvider";

export default function AdminShopPage() {
  const club = useClubContext();
  const portal = useAdminPortal().portal;
  // cinematic@2 (Rose City) keeps ShopPageEditor, which carries its shop
  // sections; ClassicShopPageEditor has no cinematic support yet.
  const classic = portal === "classic" && club.presentationTemplateKey !== "cinematic@2";
  return classic ? <ClassicShopPageEditor /> : <ShopPageEditor />;
}
