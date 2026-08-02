"use client";

import { useEffect, useState } from "react";
import ShopPurchaseDetailsSection from "@/components/ShopPurchaseDetailsSection";
import type { DBShopPurchaseDetails } from "@/lib/db-types";
import { fetchShopPurchaseDetails } from "@/lib/queries";
import {
  EMPTY_SHOP_PURCHASE_DETAILS,
  hasShopPurchaseDetails,
} from "@/lib/shop-purchase-details";
import { useClubId } from "@/components/ClubContextProvider";

export default function ShopPurchaseDetailsContainer() {
  const clubId = useClubId();
  const [details, setDetails] = useState<DBShopPurchaseDetails>(
    EMPTY_SHOP_PURCHASE_DETAILS,
  );

  useEffect(() => {
    fetchShopPurchaseDetails(clubId)
      .then(setDetails)
      .catch((error) => {
        console.error("ShopPurchaseDetails:", error);
      });
  }, [clubId]);

  return hasShopPurchaseDetails(details)
    ? <ShopPurchaseDetailsSection details={details} />
    : null;
}
