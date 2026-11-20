import RoseCityShopPage from "@/components/sites/rose-city/RoseCityShopPage";
import { bySlug } from "./index";

/** The Shop a club's site package server-renders instead of the shared page, or null (see ./index.ts). */
export const siteShopPageFor = bySlug({ "rose-city": RoseCityShopPage });
