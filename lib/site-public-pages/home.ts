import RoseCityHomePage from "@/components/sites/rose-city/RoseCityHomePage";
import { bySlug } from "./index";

/** The Home a club's site package server-renders instead of the shared page, or null (see ./index.ts). */
export const siteHomePageFor = bySlug({ "rose-city": RoseCityHomePage });
