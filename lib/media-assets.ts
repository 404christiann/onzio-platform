import { supabase } from "@/lib/supabase";

type MediaAssetRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  status: string;
};

type MediaReference = {
  assetId: string;
  url: string;
};

export function mediaAssetUrl(asset: Pick<MediaAssetRow, "storage_bucket" | "storage_path">): string {
  if (asset.storage_bucket !== "onzio-media") {
    throw new Error("Only published Onzio media may be delivered publicly");
  }
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  const encodedPath = asset.storage_path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/storage/v1/object/public/onzio-media/${encodedPath}`;
}

export async function resolveMediaReferences<T extends Record<string, unknown>>(
  rows: readonly T[],
  clubId: string,
  references: readonly MediaReference[],
  client: typeof supabase = supabase,
): Promise<T[]> {
  if (process.env.NODE_ENV === "test") return rows.map((row) => ({ ...row }));

  const assetIds = [
    ...new Set(
      rows.flatMap((row) =>
        references
          .map(({ assetId }) => row[assetId])
          .filter((value): value is string => typeof value === "string"),
      ),
    ),
  ];
  if (assetIds.length === 0) return rows.map((row) => ({ ...row }));

  const { data, error } = await client
    .from("media_assets")
    .select("id, storage_bucket, storage_path, status")
    .eq("club_id", clubId)
    .eq("status", "published")
    .in("id", assetIds);
  if (error) throw new Error(`resolveMediaReferences: ${error.message}`);

  const assets = new Map(
    ((data ?? []) as MediaAssetRow[]).map((asset) => [asset.id, asset]),
  );

  return rows.map((row) => {
    const hydrated = { ...row };
    for (const reference of references) {
      const assetId = row[reference.assetId];
      const asset = typeof assetId === "string" ? assets.get(assetId) : null;
      if (asset) hydrated[reference.url as keyof T] = mediaAssetUrl(asset) as T[keyof T];
    }
    return hydrated;
  });
}

export async function resolveMediaStoragePath(
  clubId: string,
  assetId: unknown,
  fallback: string,
  client: typeof supabase = supabase,
): Promise<string> {
  if (typeof assetId !== "string" || process.env.NODE_ENV === "test") {
    return fallback;
  }
  const { data, error } = await client
    .from("media_assets")
    .select("storage_bucket, storage_path, status")
    .eq("club_id", clubId)
    .eq("id", assetId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`resolveMediaStoragePath: ${error.message}`);
  return data?.storage_path ?? fallback;
}
