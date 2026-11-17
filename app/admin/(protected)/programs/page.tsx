"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClubContext } from "@/components/ClubContextProvider";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import TemplateFontScope from "@/components/TemplateFontScope";
import AcademyProgramsPage from "@/components/sites/diverse-city/AcademyProgramsPage";
import AcademyProgramDetailPage from "@/components/sites/diverse-city/AcademyProgramDetailPage";
import { buildProgramsPageMutationPayload } from "@/lib/program-admin";
import { resolveProgramsPageContent } from "@/lib/programs-page-content";
import type { DBProgramsPageContent } from "@/lib/db-types";
import type { ProgramPreviews } from "@/components/admin/programs/program-previews";
import { useProgramsEditor } from "@/components/admin/programs/useProgramsEditor";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { ClassicProgramsEditor } from "@/components/admin/programs/ClassicProgramsEditor";
import { LegacyProgramsEditor } from "@/components/admin/programs/LegacyProgramsEditor";
import "./programs-editor.css";

export default function AdminProgramsPage() {
  const club = useClubContext();
  const router = useRouter();
  const classic = useAdminPortal().portal !== "reimagined";
  const programsPolicy = codeSiteAdminFor(club)?.programs;
  const unsupportedTemplate = !programsPolicy?.routeVisible;
  useEffect(() => {
    if (unsupportedTemplate) router.replace("/admin");
  }, [unsupportedTemplate, router]);
  if (!programsPolicy?.routeVisible) return null;
  const previews: ProgramPreviews = {
    directory: (directoryPrograms, pageCopy) => <TemplateFontScope templateKey={club.presentationTemplateKey}>
      <AcademyProgramsPage programs={directoryPrograms} clubName={club.name} content={resolveProgramsPageContent(buildProgramsPageMutationPayload(pageCopy) as Partial<DBProgramsPageContent>, club.name)} />
    </TemplateFontScope>,
    detail: (previewProgram, previewOtherPrograms) => <TemplateFontScope templateKey={club.presentationTemplateKey}>
      <AcademyProgramDetailPage program={previewProgram} otherPrograms={previewOtherPrograms} editorPreview />
    </TemplateFontScope>,
  };
  return <ProgramsWorkspace key={club.id} clubId={club.id} clubName={club.name} programsPolicy={programsPolicy} classic={classic} previews={previews} />;
}

function ProgramsWorkspace({ clubId, clubName, programsPolicy, classic, previews }: Parameters<typeof useProgramsEditor>[0] & { previews: ProgramPreviews }) {
  const editor = useProgramsEditor({ clubId, clubName, programsPolicy, classic });
  return classic ? <ClassicProgramsEditor editor={editor} previews={previews} /> : <LegacyProgramsEditor editor={editor} previews={previews} />;
}
