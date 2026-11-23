import type { AboutValue, ClubLogoFeature, ClubLogoColorCard } from "@/lib/about-content";
import { CREST_ICON_SCALE, CREST_ICON_SIZE } from "./crest-icon";
export const newAboutValue = (): AboutValue => ({ title: "New value", description: "" });
export const newLogoFeature = (): ClubLogoFeature => ({ title: "New crest feature", description: "", patch_url: "", icon_url: "", icon_size: CREST_ICON_SIZE.default, icon_scale: CREST_ICON_SCALE.default });
export const newLogoColorCard = (): ClubLogoColorCard => ({ label: "New color", image_url: "" });

export function removeCollectionItem<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, current) => current !== index);
}
