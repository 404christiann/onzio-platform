import { EMPTY_ABOUT_PAGE_CONTENT, EMPTY_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";
import type { DBAboutPageContent, DBClubLogoPageContent } from "@/lib/db-types";
import { toAboutDraft, toLogoDraft, type AboutDrafts } from "@/components/admin/about/rose-city/about-sections";
import { starterCinematicContactContent, type CinematicContactContent } from "@/lib/cinematic-contact-content";
import { starterCinematicPolicyContent, type CinematicPolicyDraft } from "@/lib/cinematic-policies-content";

/** Shared draft fixtures for the About, Contact and Policies click-to-field tests. Every text is distinct, so a stamp on the wrong node shows. */
export const aboutFixture = (): DBAboutPageContent => ({
  ...EMPTY_ABOUT_PAGE_CONTENT, hero_title: "About Rose City", story_paragraphs: ["Story one.", "Story two.", "Story three."], feature_image_url: "/images/about.webp",
  values_heading: "What we stand for",
  values: [{ title: "Community", description: "Value one text." }, { title: "Character", description: "" }],
  closing_text: "Join us on match day.", closing_cta_label: "See the Schedule", closing_cta_href: "/schedule",
});
const feature = (n: number, icon = true) => ({ title: `Feature ${n}`, description: `About feature ${n}`, patch_url: `/images/patch-${n}.png`, icon_url: icon ? `/images/icon-${n}.png` : "", icon_size: 60 + n, icon_scale: 1 + n / 10 });
export const logoFixture = (): DBClubLogoPageContent => ({
  ...EMPTY_CLUB_LOGO_PAGE_CONTENT, annotated_image_url: "/images/crest.png", map_image_url: "/images/map.png",
  features: [feature(1), feature(2, false), feature(3)],
  color_cards: [{ label: "Red", image_url: "/images/red.png" }, { label: "Midnight", image_url: "" }, { label: "White", image_url: "/images/white.png" }],
});
/**
 * The editor's draft. toAboutDraft drops blank paragraphs and untitled values (as loading a page does), but a draft being edited
 * can hold them (an owner pressing "Add paragraph" or "Add value"), so they are added after loading, the way the editor adds them.
 */
export function aboutDrafts(): AboutDrafts {
  const drafts: AboutDrafts = { about: toAboutDraft({ ...aboutFixture(), story_paragraphs: ["Story one.", "Story two.", "Story three."], values: [{ title: "Community", description: "Value one text." }, { title: "Character", description: "" }] }), logo: toLogoDraft(logoFixture()) };
  drafts.about.story_paragraphs.splice(1, 0, "");
  drafts.about.values.splice(1, 0, { _id: "card-blank", title: "", description: "Value two text." });
  return drafts;
}

export const contactFixture = (): CinematicContactContent => ({ ...starterCinematicContactContent(), title: "Contact the Club", subtitle: "We answer fast", informationHref: "mailto:office@example.com" });

export const policiesFixture = (): CinematicPolicyDraft => {
  const draft = starterCinematicPolicyContent();
  draft.guidelines.title = "Stadium Guidelines"; draft.guidelines.subtitle = "& FAQ’s"; draft.guidelines.heading = "Guidelines";
  draft.guidelines.rows = [
    { id: "accessibility", heading: "Accessibility", blocks: [{ kind: "subheading", text: "Parking" }, { kind: "paragraph", text: "" }, { kind: "paragraph", text: "ADA parking." }, { kind: "paragraph", text: "   " }, { kind: "paragraph", text: "Seating." }] },
    { id: "animals", heading: "Animals", blocks: [{ kind: "paragraph", text: "No pets." }] },
    { id: "bags", heading: "Bags & Backpacks", blocks: [] },
  ];
  draft.fanCode.rows = [{ id: "respect", heading: "Respect", blocks: [{ kind: "paragraph", text: "Be kind." }] }];
  return draft;
};
