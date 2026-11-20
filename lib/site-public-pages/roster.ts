import RoseCityRosterPage from "@/components/sites/rose-city/RoseCityRosterPage";
import { bySlug } from "./index";

/** The Roster a club's site package server-renders instead of the shared page, or null (see ./index.ts). */
export const siteRosterPageFor = bySlug({ "rose-city": RoseCityRosterPage });
