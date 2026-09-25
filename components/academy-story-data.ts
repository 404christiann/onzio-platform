import { fetchHomepageStorySection } from "@/lib/queries";
import type { HomepageStoryContent } from "@/lib/homepage-story-content";

/** Let the approved template story appear if its optional content read stalls. */
export const ACADEMY_STORY_FALLBACK_MS = 2_500;

export function loadAcademyStoryData(
  clubId: string,
  clubName: string,
  callbacks: {
    onContent: (content: HomepageStoryContent) => void;
    onSettled: () => void;
  },
): () => void {
  let active = true;
  let settled = false;
  const settle = () => {
    if (!active || settled) return;
    settled = true;
    callbacks.onSettled();
  };
  const timeout = setTimeout(settle, ACADEMY_STORY_FALLBACK_MS);

  void fetchHomepageStorySection(clubId, clubName)
    .then((content) => {
      if (active) callbacks.onContent(content);
    })
    .catch((error) => {
      if (active) console.error("DevelopingNextGeneration:", error);
    })
    .finally(() => {
      clearTimeout(timeout);
      settle();
    });

  return () => {
    active = false;
    clearTimeout(timeout);
  };
}
