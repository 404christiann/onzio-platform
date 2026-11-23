import { editTarget, editTargetRowId, type EditTargetId, type ResolvedEditTarget } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { PartnerPage } from "@/lib/cinematic-partners-content";
import { pageDialogId, parseDialogId, partnerDialogId } from "./partners-sections";

/**
 * Click-to-field for the Partners editor (UI-PREVIEW-CLICK-LIST-1). The ids are declared in EDIT_TARGET_REGISTRY ("partners");
 * PartnersDialogFields stamps them on the dialog controls, and the *Stamps below put the same ids on the public nodes inside a
 * card's preview only (never on the public page).
 *
 * The two page cards (`page:partners`, `page:opportunities`) are the registry sections `partners` and `opportunities`. Every
 * partner is the one section `partner`, its fields keyed by the partner's row uuid, because the registry is static and a
 * partner's dialog id (`partner:<uuid>`) is not. A card only accepts the fields it owns (partnersOwnsTarget), so the partners
 * drawn inside a page card (they belong to their own cards) are never stamped there.
 *
 * Left unstamped on purpose: a partner's colour treatment (it recolours the logo, there is no node of its own: its control is
 * stamped), the page card's partner grid, the `a` href (the same node as the button's words) and, once a logo is chosen, the
 * partner's name (it is only the logo's description for screen readers; the name shows as text only while no logo is set).
 */
export type PartnerPageField = "title" | "subtitle" | "intro" | "ctaPrompt" | "ctaLabel" | "ctaHref";
export type PartnerField = "name" | "role" | "logo" | "tone";

export const partnerPageTarget = (page: PartnerPage, field: PartnerPageField): EditTargetId => editTarget("partners", page, field);
export const partnerTarget = (partnerId: string, field: PartnerField): EditTargetId => editTarget("partners", "partner", field, partnerId);

/** Whether a declared field belongs to the card with this dialog id: its own page's fields, or its own partner's row. */
export function partnersOwnsTarget(dialogId: string, target: ResolvedEditTarget): boolean {
  const parsed = parseDialogId(dialogId);
  if (!parsed) return false;
  return parsed.kind === "page"
    ? target.editor === "partners" && target.section === parsed.page && target.row === undefined
    : target.editor === "partners" && target.section === "partner" && target.row === editTargetRowId(parsed.id);
}

const fixed = (id: EditTargetId) => () => id;

/** Where each of a page's fields shows on the public page, as rendered by components/cinematic/CinematicPartners. */
export function partnersPageStamps(page: PartnerPage): EditTargetStamp[] {
  return [
    { selector: ".partner-heading > div > h1", target: fixed(partnerPageTarget(page, "title")) },
    { selector: ".partner-heading > div > p", target: fixed(partnerPageTarget(page, "subtitle")) },
    { selector: ".partner-body > p.partner-intro", target: fixed(partnerPageTarget(page, "intro")) },
    { selector: ".partner-action > p", target: fixed(partnerPageTarget(page, "ctaPrompt")) },
    { selector: ".partner-action > a", target: fixed(partnerPageTarget(page, "ctaLabel")) },
  ];
}

/** Where one partner's fields show on its card (one partner drawn by the public card), keyed by the partner's row uuid. */
export function partnerItemStamps(partnerId: string): EditTargetStamp[] {
  return [
    { selector: ".partner-card > .partner-logo > img", target: fixed(partnerTarget(partnerId, "logo")) },
    { selector: ".partner-card > .partner-logo > .partner-pending > span", target: fixed(partnerTarget(partnerId, "name")) },
    { selector: ".partner-card > p", target: fixed(partnerTarget(partnerId, "role")) },
  ];
}

/** The stamps of the two page cards, by the card's dialog id. Fixed: where a page's fields sit in its card does not depend on the draft. */
export function partnersPageStampsByCard(): Map<string, EditTargetStamp[]> {
  return new Map((["partners", "opportunities"] as const).map(page => [pageDialogId(page) as string, partnersPageStamps(page)]));
}

/** The stamps of every partner card, by the card's dialog id, each keyed by that partner's own uuid (not by its position). */
export function partnerStampsByCard(partners: readonly { id: string }[]): Map<string, EditTargetStamp[]> {
  return new Map(partners.map(partner => [partnerDialogId(partner.id) as string, partnerItemStamps(partner.id)]));
}
