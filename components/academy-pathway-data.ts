import {
  fetchPrograms,
  fetchProgramsPageContent,
  type ProgramContent,
} from "@/lib/queries";
import type { ProgramsPageContent } from "@/lib/programs-page-content";

export const ACADEMY_PATHWAY_PROGRAMS_FALLBACK_MS = 2_500;

/** Load the link list independently so a stalled copy read cannot hold the section. */
export function loadPathwayData(
  clubId: string,
  clubName: string,
  callbacks: {
    onPrograms: (programs: ProgramContent[]) => void;
    onProgramsSettled: () => void;
    onContent: (content: ProgramsPageContent) => void;
  },
): () => void {
  let active = true;
  let programsSettled = false;
  const settlePrograms = () => {
    if (!active || programsSettled) return;
    programsSettled = true;
    clearTimeout(programsTimer);
    callbacks.onProgramsSettled();
  };
  // A stalled list read should let the homepage move on. A late response can
  // still populate the pathway without holding a permanent loading block.
  const programsTimer = setTimeout(settlePrograms, ACADEMY_PATHWAY_PROGRAMS_FALLBACK_MS);

  void fetchPrograms(clubId)
    .then((programs) => {
      if (active) callbacks.onPrograms(programs);
    })
    .catch((error) => {
      if (active) console.error("AcademyProgramsPathway:", error);
    })
    .finally(() => {
      settlePrograms();
    });

  void fetchProgramsPageContent(clubId, clubName)
    .then((content) => {
      if (active) callbacks.onContent(content);
    })
    .catch((error) => {
      if (active) console.error("AcademyProgramsPathway content:", error);
    });

  return () => {
    active = false;
    clearTimeout(programsTimer);
  };
}
