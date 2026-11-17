import type { HomepageDraft, PieceId } from "./model";

// ADMIN-RE-09: which pieces of the page carry a "Changed" tag in the
// reimagined editor. A piece is changed when what it shows differs from the
// homepage as it was when the editor opened, so the tag stays after a save and
// goes away if the words are put back.

type Read = (draft: HomepageDraft) => unknown;

const photos: Read = (draft) => [
  draft.photos.seasonLabel,
  draft.photos.items.map(({ clientId, rowId, assetId, alt }) => [clientId, rowId, assetId, alt]),
];
const storyText: Read = ({ story }) => [story.visible, story.heading, story.bodyPrimary, story.bodySecondary];
const storyButton: Read = ({ story }) => story.ctaLabel;

const PIECE_VALUES: Partial<Record<PieceId, Read>> = {
  "hero.eyebrow": ({ hero }) => hero.eyebrow,
  "hero.heading": ({ hero }) => [hero.headline_line_one, hero.headline_line_two],
  "hero.intro": ({ hero }) => hero.intro,
  "hero.cta": ({ hero }) => [hero.primary_cta_label, hero.primary_cta_href, hero.secondary_cta_label, hero.secondary_cta_href],
  photos,
  "story.text": storyText,
  "story.cta": storyButton,
  story: (draft) => [storyText(draft), storyButton(draft)],
  video: ({ video }) => video,
};

export function getChangedHomepagePieces(opened: HomepageDraft, draft: HomepageDraft): PieceId[] {
  return (Object.keys(PIECE_VALUES) as PieceId[]).filter((piece) => {
    const read = PIECE_VALUES[piece]!;
    return JSON.stringify(read(opened)) !== JSON.stringify(read(draft));
  });
}
