import RoseCityMatchPage from "@/components/sites/rose-city/RoseCityMatchPage";
import { bySlug } from "./index";

/** The Match Summary a club's site package server-renders instead of the shared page, or null (see ./index.ts). */
export const siteMatchPageFor = bySlug({ "rose-city": RoseCityMatchPage });
