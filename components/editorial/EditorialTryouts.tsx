"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import EditorialTryoutsView from "@/components/editorial/EditorialTryoutsView";
import { fetchTryoutPageContent, type TryoutPageContent } from "@/lib/club-identity";

/**
 * Fetches the club's informational tryout page content
 * (`tryout_page_content`, via the already-implemented, tenant-scoped
 * `fetchTryoutPageContent` helper) once here and passes it down to the
 * presentational `EditorialTryoutsView`, mirroring `EditorialClubStory`'s
 * fetch-once-and-pass-down container convention.
 */
export default function EditorialTryouts() {
  const club = useClubContext();
  const [content, setContent] = useState<TryoutPageContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTryoutPageContent(club.id)
      .then((result) => {
        if (!cancelled) setContent(result);
      })
      .catch((error) => {
        console.error("EditorialTryouts:", error);
        if (!cancelled) setContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  return <EditorialTryoutsView content={content} />;
}
