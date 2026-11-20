import RoseCitySchedulePage from "@/components/sites/rose-city/RoseCitySchedulePage";
import { bySlug } from "./index";

/** The Schedule a club's site package server-renders instead of the shared page, or null (see ./index.ts). */
export const siteSchedulePageFor = bySlug({ "rose-city": RoseCitySchedulePage });
