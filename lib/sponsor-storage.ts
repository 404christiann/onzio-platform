"use client";

import { createClient } from "@/lib/admin-client";
import { GRAPHIC_UPLOAD_MAX_BYTES, GRAPHIC_UPLOAD_MAX_SIZE_LABEL, GRAPHIC_UPLOAD_TYPES_LABEL, isGraphicUploadType } from "@/lib/media-upload-types";
import { sponsorStoragePathFromPublicUrl } from "@/lib/sponsor-content";

// Sponsor logo files, shared by the classic Sponsors page and the one-list page
// (ADMIN-RE-15). Uploads go through the admin client's media chain, which
// publishes a versioned file and remembers its asset id for the row's
// media_asset_id.

/** Why a sponsor logo cannot be uploaded (wrong type or over the graphic size limit), or null when it can. */
export function sponsorLogoFileIssue(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!isGraphicUploadType(file.type)) {
    return `${file.name} is not a ${GRAPHIC_UPLOAD_TYPES_LABEL} image. Sponsor logos must be ${GRAPHIC_UPLOAD_TYPES_LABEL}.`;
  }
  if (file.size > GRAPHIC_UPLOAD_MAX_BYTES) {
    return `${file.name} is too large. Sponsor logos must be ${GRAPHIC_UPLOAD_MAX_SIZE_LABEL} or smaller.`;
  }
  return null;
}

/** Uploads one logo and returns its public address. `folder` only names the path. */
export async function uploadSponsorLogo(file: File, folder: string): Promise<string> {
  // The media server accepts only the graphic types and sizes in the rules for sponsor logos; say so here
  // instead of letting a JPG or an oversize file fail after upload.
  const issue = sponsorLogoFileIssue(file);
  if (issue) throw new Error(issue);
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "png";
  const path = `site-sponsors/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from("sponsors").upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("sponsors").getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteSponsorStorageUrls(urls: string[]): Promise<void> {
  const paths = urls
    .map(sponsorStoragePathFromPublicUrl)
    .filter((path): path is string => Boolean(path));
  if (paths.length === 0) return;

  const supabase = createClient();
  const { error } = await supabase.storage.from("sponsors").remove(paths);
  if (error) throw new Error(error.message);
}

/** Deletes the files no sponsor row and no game uses any more. */
export async function deleteUnusedSponsorStorageUrls(urls: string[]): Promise<void> {
  const supabase = createClient();
  const unusedUrls: string[] = [];

  for (const url of urls) {
    const { count, error } = await supabase
      .from("site_sponsor_logos")
      .select("id", { count: "exact", head: true })
      .eq("logo_url", url);
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) continue;
    // ADMIN-RE-07b: Add a game can give a game a Sponsors-page logo, so a
    // logo a game still shows is kept too. When that can't be checked, the
    // file stays: a leftover file is harmless, a missing logo is not.
    const games = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("sponsor_logo_url", url);
    if (!games.error && (games.count ?? 0) === 0) unusedUrls.push(url);
  }

  await deleteSponsorStorageUrls(unusedUrls);
}
