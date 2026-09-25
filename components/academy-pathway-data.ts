import {
  fetchPrograms,
  fetchProgramsPageContent,
  type ProgramContent,
} from "@/lib/queries";
import type { ProgramsPageContent } from "@/lib/programs-page-content";

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

  void fetchPrograms(clubId)
    .then((programs) => {
      if (active) callbacks.onPrograms(programs);
    })
    .catch((error) => {
      if (active) console.error("AcademyProgramsPathway:", error);
    })
    .finally(() => {
      if (active) callbacks.onProgramsSettled();
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
  };
}
