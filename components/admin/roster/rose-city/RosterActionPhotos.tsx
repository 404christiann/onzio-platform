"use client";

import { useEffect, useState } from "react";
import { IconClose } from "@/components/admin/icons";
import FileUpload from "@/components/admin/FileUpload";
import { fileUploadRules } from "@/components/admin/ui/adminImageFiles";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { createClient } from "@/lib/admin-client";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { uploadRosterPhoto } from "./rose-city-roster-save";
import styles from "./rose-city-roster.module.css";

type ActionPhoto = { id: string; url: string; sort_order: number };

/** The classic editor's action photos, unchanged: each upload and each delete writes straight away, outside Save player. */
export function RosterActionPhotos({ playerId }: { playerId: string }) {
  const [photos, setPhotos] = useState<ActionPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPhotos() {
    const { data, error: problem } = await createClient().from("player_photos").select("id, url, sort_order")
      .eq("player_id", playerId).order("sort_order", { ascending: true });
    if (problem) { setError(problem.message); return; }
    setPhotos((data ?? []) as ActionPhoto[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadPhotos(); }, [playerId]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true); setError(null);
    try {
      const client = createClient();
      const nextOrder = photos.length > 0 ? Math.max(...photos.map(photo => photo.sort_order)) + 1 : 0;
      for (let index = 0; index < files.length; index++) {
        const url = await uploadRosterPhoto(client, files[index], "player-action-photos", "action");
        const { error: insertError } = await client.from("player_photos").insert([{ player_id: playerId, url, sort_order: nextOrder + index }]);
        if (insertError) throw new Error(insertError.message);
      }
      await loadPhotos();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Upload failed");
    }
    setUploading(false);
  }

  async function handleDelete(photo: ActionPhoto) {
    setError(null);
    try {
      const { error: deleteError } = await createClient().from("player_photos").delete().eq("id", photo.id);
      if (deleteError) throw new Error(deleteError.message);
      await deleteStorageUrls("player-action-photos", [photo.url], ["action/"]);
      await loadPhotos();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Failed to delete photo");
    }
  }

  return (
    <div className={styles.fields}>
      <p className={styles.help} style={{ margin: 0 }}>Shown in the player&rsquo;s profile on the site. Each photo uploads or deletes straight away, without Save.</p>
      {error && <p role="alert" className={styles.alert} style={{ margin: 0 }}>{error}</p>}
      {photos.length > 0 && (
        <div className={styles.photos}>
          {photos.map((photo, index) => (
            <div key={photo.id} className={styles.photoCell}>
              <ResilientNativeImage src={photo.url} alt={`Action photo ${index + 1}`} fallbackVariant="person" />
              <button type="button" className={styles.photoDelete} aria-label={`Delete action photo ${index + 1}`} onClick={() => void handleDelete(photo)}>
                <span><IconClose size={12} aria-hidden="true" /></span>
              </button>
            </div>
          ))}
        </div>
      )}
      <FileUpload label="Add action photos" {...fileUploadRules("photo")} multiple onUpload={files => void handleUpload(files)} uploading={uploading} density="compact" />
    </div>
  );
}
