import { clubLogoUrl } from "@/lib/club-branding";

export const ROSE_CITY_PATCH_URL = clubLogoUrl();

const PLACEHOLDER_LOGO_ASSETS = [
  "/images/logo/rosecityLogo",
  "Rose%20City%20FC%20Patch%20Color.png",
  "Rose City FC Patch Color.png",
  "club-branding/",
  "1777665003666-qlw6vgfl3m.jpg",
  "1777664973762-9yqfdcsscmt.jpg",
  "1777666285744-ktas1t7udgj.jpg",
  "1777686443621-860xqedznt2.jpg",
  "1777667735062-zwpbfxx20ad.jpg",
  "1777665514019-a41fo6c2wlv.jpg",
  "1777664941496-t2p40gs7bff.jpg",
  "1777664961949-pqbtxgs01ql.jpg",
  "1777667861918-jdea5upg1k.jpg",
];

export function isRosterPlaceholderLogo(src?: string | null): boolean {
  return !src?.trim() || PLACEHOLDER_LOGO_ASSETS.some((asset) => src.includes(asset));
}

export function getRosterImageSrc(
  src?: string | null,
  currentClubLogoUrl: string = ROSE_CITY_PATCH_URL,
): string {
  return isRosterPlaceholderLogo(src) ? currentClubLogoUrl : src!;
}

/** Keeps a missing-player photo linked to the current shared club logo. */
export function rosterImageForStorage(src?: string | null): string {
  return isRosterPlaceholderLogo(src) ? "" : src!.trim();
}
