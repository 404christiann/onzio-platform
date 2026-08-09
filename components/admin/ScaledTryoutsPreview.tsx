"use client";

import AcademyTryoutsPage from "@/components/AcademyTryoutsPage";
import ScaledPagePreview from "@/components/admin/ScaledPagePreview";
import type { TryoutContent } from "@/lib/queries";

/**
 * Live-style preview for /admin/tryouts. The scaling itself lives in
 * ScaledPagePreview, which is also what fixed this preview not fitting its
 * panel — see the comment there.
 */
interface ScaledTryoutsPreviewProps {
  tryouts: TryoutContent[];
  clubName: string;
  contactEmail: string;
}

export default function ScaledTryoutsPreview({
  tryouts,
  clubName,
  contactEmail,
}: ScaledTryoutsPreviewProps) {
  return (
    <ScaledPagePreview className="bg-[#F9FAFD]">
      <AcademyTryoutsPage
        tryouts={tryouts}
        clubName={clubName}
        contactEmail={contactEmail}
      />
    </ScaledPagePreview>
  );
}
