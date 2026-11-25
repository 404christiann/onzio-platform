"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClubContext } from "@/components/ClubContextProvider";
import { usePublicPageVisibility } from "@/components/PublicPageVisibilityProvider";
import { trackAdminEvent } from "@/lib/admin-analytics";
import { EditorNotice } from "@/components/admin/cinematic-editor/CinematicEditorKit";
import { ValidationMessage } from "@/components/admin/ui/editor-kit";
import { PAGE_HIDDEN_BANNER, VISIBLE_TO_VISITORS_LABEL, pageVisible, type PublicPageKey } from "@/lib/public-page-visibility";
import { changePageVisibility } from "./page-visibility-change";
import { ShowRow } from "./PartnerPageParts";
import styles from "./PartnerPageParts.module.css";

/**
 * The page-level "Visible to visitors" switch for Robinson Stadium, Chick-fil-A and Foothill Transit.
 * It saves on its own the moment it is toggled. It is not part of the page's content draft, so it
 * never counts as an edit: the Save button, Discard and the leave-page guard ignore it.
 * While the page is hidden a banner sits above the switch; editing stays available.
 */
export function PageVisibilityControl({ pageKey, note }: { pageKey: PublicPageKey; note?: string }) {
  const club = useClubContext();
  const visibility = usePublicPageVisibility();
  const router = useRouter();
  const clubVisible = pageVisible({ publicPageVisibility: visibility }, pageKey);
  const [visible, setVisible] = useState(clubVisible);
  const [seen, setSeen] = useState({ clubId: club.id, clubVisible });
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const noteId = useId();
  const clubId = useRef(club.id);
  clubId.current = club.id;
  // A different club, or a refreshed visibility map, replaces what the switch shows.
  if (seen.clubId !== club.id || seen.clubVisible !== clubVisible) {
    setSeen({ clubId: club.id, clubVisible });
    setVisible(clubVisible); setSaving(false); setFailure("");
  }

  async function change(next: boolean) {
    if (saving) return;
    const owner = club.id, previous = visible;
    setVisible(next); setSaving(true); setFailure("");
    try {
      const result = await changePageVisibility(pageKey, next, previous);
      if (clubId.current !== owner) return;
      setVisible(result.visible); setFailure(result.failure ?? "");
      // The admin layout holds the visibility map; refreshing re-renders it with a fresh read, so this switch (and any later visit) reads the saved value.
      if (!result.failure) {
        trackAdminEvent("admin_visibility_toggled", { scope: pageKey, visible: result.visible });
        router.refresh();
      }
    } finally {
      if (clubId.current === owner) setSaving(false);
    }
  }

  return <div className={styles.notice} data-page-visibility="" data-page-visibility-page={pageKey}>
    {!visible && <div data-page-hidden-banner=""><ValidationMessage live="polite">{PAGE_HIDDEN_BANNER}</ValidationMessage></div>}
    <ShowRow label={VISIBLE_TO_VISITORS_LABEL} switchLabel={VISIBLE_TO_VISITORS_LABEL} checked={visible} disabled={saving} onChange={next => void change(next)} describedBy={note ? noteId : undefined} />
    {note && <p id={noteId} className={styles.note} data-page-visibility-note="">{note}</p>}
    {failure && <EditorNotice failed>{failure}</EditorNotice>}
  </div>;
}
