"use client";

import AcademyProgramDetailPage from "@/components/AcademyProgramDetailPage";
import ScaledPagePreview from "@/components/admin/ScaledPagePreview";
import type { ProgramContent } from "@/lib/queries";

/**
 * Live-style preview for /admin/programs, matching ScaledAboutPreview,
 * ScaledContactPreview, and ScaledTryoutsPreview.
 *
 * It renders the whole public program detail page — cinematic hero, the
 * registration band in its real position when the Registration tab's toggle is
 * on, the highlight/detail bands when it is off, and the closing
 * "Explore other programs." row — not a fragment, because the point of the
 * preview is showing where the registration band lands relative to everything
 * else. The scaling lives in ScaledPagePreview.
 *
 * Not gated on a template: it renders whatever the program detail page renders
 * for the club's own draft. Today /programs exists only for academy@1
 * (packages/presentation/index.ts lists `programs` in its routes and not in
 * clubhouse@1's, and the route itself 404s for other templates), so today that
 * is the only place it can appear — but that is the route registry's decision,
 * not a condition this component asserts.
 */
export default function ScaledProgramPreview({
  program,
  otherPrograms,
}: {
  program: ProgramContent;
  otherPrograms: ProgramContent[];
}) {
  return (
    <ScaledPagePreview className="bg-[#F9FAFD]">
      <AcademyProgramDetailPage
        program={program}
        otherPrograms={otherPrograms}
      />
    </ScaledPagePreview>
  );
}
