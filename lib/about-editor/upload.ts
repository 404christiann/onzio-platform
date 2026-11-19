import { createClient } from "@/lib/admin-client";

/** Uploads one About or Club Logo image through the secure media path and returns its public URL. A stable path names the slot (the color cards); every upload is still stored as a new asset. */
export async function uploadAboutImage(file: File, stablePath?: string, kind: "photo" | "graphic" = "photo"): Promise<string> {
  const supabase = createClient();
  const bucket = kind === "graphic" ? "Aboutassets" : "about-page";
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = stablePath ?? `content/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: stablePath ? "0" : undefined,
    upsert: Boolean(stablePath),
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return stablePath ? `${data.publicUrl}?v=${Date.now()}` : data.publicUrl;
}
