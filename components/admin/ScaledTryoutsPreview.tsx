"use client";

import AcademyTryoutsPage from "@/components/sites/diverse-city/AcademyTryoutsPage";
import TryoutsPreviewFrame from "@/components/admin/TryoutsPreviewFrame";
import { useClubContext } from "@/components/ClubContextProvider";
import type { TryoutContent } from "@/lib/queries";
import type { TryoutsPageContent } from "@/lib/tryouts-page-content";

interface ScaledTryoutsPreviewProps {
  tryouts: TryoutContent[];
  clubName: string;
  contactEmail: string;
  /** Page-level intro copy, resolved from the unsaved page-copy draft. */
  content: TryoutsPageContent;
  phone?: boolean;
  selected?: string | null;
  onSelect?: (target: string) => void;
}

export default function ScaledTryoutsPreview({
  tryouts,
  clubName,
  contactEmail,
  content,
  phone = false,
  selected = null,
  onSelect,
}: ScaledTryoutsPreviewProps) {
  const club = useClubContext();
  return (
    <TryoutsPreviewFrame phone={phone} host={club.name} onSelect={onSelect}>
      <AcademyTryoutsPage
        tryouts={tryouts}
        clubName={clubName}
        contactEmail={contactEmail}
        content={content}
        editor={onSelect ? { selected, onSelect } : undefined}
      />
    </TryoutsPreviewFrame>
  );
}
