"use client";

import AcademyContactPage from "@/components/AcademyContactPage";
import ScaledPagePreview from "@/components/admin/ScaledPagePreview";
import type { ContactContent } from "@/lib/queries";

/**
 * Live-style preview for /admin/contact, matching the Tryouts and About tabs:
 * the real public page component, rendered at desktop width and scaled to the
 * admin column, including the unsaved draft.
 */
export default function ScaledContactPreview({
  content,
  clubName,
}: {
  content: ContactContent;
  clubName: string;
}) {
  return (
    <ScaledPagePreview className="bg-[#F9FAFD]">
      <AcademyContactPage content={content} clubName={clubName} />
    </ScaledPagePreview>
  );
}
