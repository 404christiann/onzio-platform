import { describe, expect, it } from "vitest";
import { getChangedHomepagePieces } from "@/lib/homepage-editor/changed-pieces";
import type { HomepageDraft } from "@/lib/homepage-editor/model";
import { homepageDraft, photoFixture } from "../fixtures/homepage-editor";

// ADMIN-RE-09: the "Changed" tags in the reimagined website editor.

function draft(): HomepageDraft {
  return homepageDraft() as HomepageDraft;
}

describe("changed homepage pieces", () => {
  it("is empty when nothing differs from the homepage as it opened", () => {
    expect(getChangedHomepagePieces(draft(), draft())).toEqual([]);
  });

  it("tags only the date line when the small heading changes", () => {
    const next = draft();
    next.hero.eyebrow = "Saturday, Nov 22 · Lincoln Park";
    expect(getChangedHomepagePieces(draft(), next)).toEqual(["hero.eyebrow"]);
  });

  it("drops the tag again when the words are put back", () => {
    const next = draft();
    next.hero.eyebrow = "Saturday, Nov 22";
    next.hero.eyebrow = draft().hero.eyebrow;
    expect(getChangedHomepagePieces(draft(), next)).toEqual([]);
  });

  it("maps each hero field to the piece that shows it", () => {
    const next = draft();
    next.hero.headline_line_two = "Everyone plays";
    next.hero.secondary_cta_href = "/about";
    expect(getChangedHomepagePieces(draft(), next)).toEqual(["hero.heading", "hero.cta"]);
  });

  it("tags the photos when one is reordered, described or added", () => {
    const reordered = draft();
    reordered.photos.items = [reordered.photos.items[1], reordered.photos.items[0]];
    expect(getChangedHomepagePieces(draft(), reordered)).toEqual(["photos"]);

    const described = draft();
    described.photos.items[0].alt = "Under 10s at practice";
    expect(getChangedHomepagePieces(draft(), described)).toEqual(["photos"]);

    const added = draft();
    added.photos.items.push(photoFixture(3) as HomepageDraft["photos"]["items"][number]);
    expect(getChangedHomepagePieces(draft(), added)).toEqual(["photos"]);
  });

  it("tags the story text and the story button separately", () => {
    const text = draft();
    text.story.visible = false;
    expect(getChangedHomepagePieces(draft(), text)).toEqual(["story.text", "story"]);

    const button = draft();
    button.story.ctaLabel = "Read our story";
    expect(getChangedHomepagePieces(draft(), button)).toEqual(["story.cta", "story"]);
  });

  it("tags the video feature for any of its words or its visibility", () => {
    const next = draft();
    next.video.visible = true;
    expect(getChangedHomepagePieces(draft(), next)).toEqual(["video"]);
  });
});
