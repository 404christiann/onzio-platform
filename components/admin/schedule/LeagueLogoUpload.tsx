"use client";

import { useRef, useState } from "react";
import Image from "@/components/ResilientImage";
import { adminImageRules, imageFileIssue } from "@/components/admin/ui/adminImageFiles";
import { createClient } from "@/lib/admin-client";
import { mediaHint } from "@/lib/media-rules";
import { GRAPHIC_UPLOAD_ACCEPT, GRAPHIC_UPLOAD_TYPES_LABEL, isGraphicUploadType } from "@/lib/media-upload-types";

export default function LeagueLogoUpload({ inputId, logoUrl, leagueName, onUploaded, onRemove }: {
  inputId: string;
  logoUrl: string | null;
  leagueName: string;
  onUploaded: (url: string) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file?: File) {
    if (!file) return;
    if (!isGraphicUploadType(file.type)) {
      setError(`Choose a ${GRAPHIC_UPLOAD_TYPES_LABEL} logo.`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    // League logos upload to a graphic bucket: refuse an oversize or unreadable file here, with the reason.
    const issue = await imageFileIssue(file, adminImageRules("graphic"));
    if (issue) {
      setError(issue);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true); setError(null);
    try {
      const storage = createClient().storage.from("league-logos");
      const path = `match-leagues/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "webp"}`;
      const { error: uploadError } = await storage.upload(path, file, { upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      await onUploaded(storage.getPublicUrl(path).data.publicUrl);
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The logo could not be uploaded. Try again."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  return <div className="flex flex-wrap items-center gap-3">
    <div className="relative flex h-14 w-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
      {logoUrl ? <Image src={logoUrl} alt={leagueName ? `${leagueName} league logo` : "League logo"} fill sizes="64px" className="object-contain p-2" />
        : <span className="font-body text-xs text-black/50">No logo</span>}
    </div>
    <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
      aria-label={uploading ? "Uploading league logo" : logoUrl ? "Replace league logo" : "Upload league logo"}
      className="min-h-11 rounded-lg border border-border bg-card px-4 py-2.5 font-body text-sm font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
    </button>
    {logoUrl && !uploading && <button type="button" onClick={() => { void Promise.resolve().then(onRemove).catch(() => setError("The logo could not be removed. Try again.")); }}
      aria-label="Remove league logo" className="min-h-11 rounded-lg px-3 py-2.5 font-body text-sm font-semibold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Remove</button>}
    <p id={`${inputId}-format-hint`} className="w-full font-body text-xs text-muted-foreground">{mediaHint("graphic")}. Clear the logo to show the competition name instead.</p>
    <input id={inputId} ref={fileRef} type="file" accept={GRAPHIC_UPLOAD_ACCEPT} aria-describedby={`${inputId}-format-hint`} className="hidden" onChange={event => { void upload(event.target.files?.[0]); }} />
    {error && <p role="alert" className="w-full font-body text-xs text-destructive">{error}</p>}
  </div>;
}
