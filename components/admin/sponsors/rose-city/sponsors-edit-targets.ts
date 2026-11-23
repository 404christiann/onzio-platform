import { editTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { Place } from "./rose-city-sponsors-model";

/**
 * Click-to-field for the Rose City Sponsors editor (UI-PREVIEW-CLICK-LIST-2). The ids are declared in EDIT_TARGET_REGISTRY
 * ("sponsors"): the one section is the homepage carousel card, and each sponsor's fields are keyed by its stable draft key (the
 * row's `data-sponsor-row`), never by its position. RoseCitySponsorFields stamps the same ids on the dialog controls, and
 * sponsorStamps puts the `logo` id on the logo pictures inside the carousel card's preview only (never on the public page).
 *
 * The strip draws only the pictures, so the name (the picture's description) and the website (its link) have a control and no
 * node on the preview. The strip's heading is the Homepage's (`homepage.sponsors.heading`) and is not stamped here.
 *
 * The public strip draws every logo twice, the second set (aria-hidden) so the strip can loop. The clone set is stamped too, to
 * the same sponsor as its original: whichever copy has scrolled under the pointer opens that sponsor's logo control.
 */
export type SponsorField = "name" | "website" | "logo";

export const sponsorTarget = (draftKey: string, field: SponsorField): EditTargetId => editTarget("sponsors", "carousel", field, draftKey);

/**
 * Where the carousel's logos show: every image in either `.sponsor-set` (the real set, then its clone), mapped to the sponsor
 * that draws it. `draftKeys` is the keys of the sponsors in the place, in the order the strip draws them.
 */
export function sponsorStamps(draftKeys: readonly string[]): EditTargetStamp[] {
  return [{
    selector: ".sponsor-set img",
    // By the sponsor's own slot in its set, not by image count: a broken logo is drawn as a fallback box (no img), so
    // counting images would hand every later logo to the wrong sponsor.
    target: element => {
      const slot = sponsorSlot(element);
      return slot !== null && slot < draftKeys.length ? sponsorTarget(draftKeys[slot], "logo") : null;
    },
  }];
}

/** The position of the sponsor that draws `element` within its `.sponsor-set` (each sponsor is one child: an img or a link). */
export function sponsorSlot(element: Element): number | null {
  for (let node: Element | null = element; node?.parentElement; node = node.parentElement) {
    if (node.parentElement.classList.contains("sponsor-set")) return Array.from(node.parentElement.children).indexOf(node);
  }
  return null;
}

/** One stamps array per place, by the place id (the card's section id). */
export function sponsorStampsByPlace(draftKeysByPlace: Readonly<Partial<Record<Place, readonly string[]>>>): Map<string, EditTargetStamp[]> {
  return new Map(Object.entries(draftKeysByPlace).map(([place, keys]) => [place, sponsorStamps(keys ?? [])]));
}
