"use client";

import ShopPageEditor from "@/components/admin/shop/ShopPageEditor";
import ClassicShopPageEditor from "@/components/admin/shop/ClassicShopPageEditor";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";

export default function AdminShopPage() {
  return useAdminPortal().portal === "classic" ? <ClassicShopPageEditor /> : <ShopPageEditor />;
}
