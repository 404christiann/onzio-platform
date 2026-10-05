import type { AboutValue, ClubLogoFeature, ClubLogoColorCard } from "@/lib/about-content";
export const newAboutValue = (): AboutValue => ({ title: "New value", description: "" });
export const newLogoFeature = (): ClubLogoFeature => ({ title: "New crest feature", description: "", patch_url: "", icon_url: "", icon_size: 70, icon_scale: 1 });
export const newLogoColorCard = (): ClubLogoColorCard => ({ label: "New color", image_url: "" });

export function removeCollectionItem<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, current) => current !== index);
}
