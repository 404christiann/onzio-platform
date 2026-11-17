import type { ReactNode } from "react";
import type { ProgramContent } from "@/lib/queries";
import type { ProgramsPageDraft } from "@/lib/program-admin";
export type ProgramPreviews = {
  directory: (directoryPrograms: ProgramContent[], pageCopy: ProgramsPageDraft) => ReactNode;
  detail: (previewProgram: ProgramContent, previewOtherPrograms: ProgramContent[]) => ReactNode;
};
