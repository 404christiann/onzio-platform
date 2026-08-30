"use client";

import { createClient as createAuthClient } from "@/lib/supabase-browser";
import { withoutClientTenantIdentity } from "@/lib/admin-payload";

type Filter = {
  kind: "eq" | "neq" | "gt" | "in";
  column: string;
  value: unknown;
};

type AdminResult<T = any> = {
  data: T | null;
  count: number | null;
  error: { code: string; message: string } | null;
};

type PublishedMedia = {
  assetId: string;
  storagePath: string;
  publicUrl: string;
};

type MediaUploadAuthorization = {
  path: string;
  token: string;
  authorization: string;
};

const publishedMedia = new Map<string, PublishedMedia>();

const MEDIA_REFERENCE_FIELDS: Record<
  string,
  ReadonlyArray<{ source: string; asset: string }>
> = {
  about_page_content: [
    { source: "feature_image_url", asset: "feature_image_asset_id" },
  ],
  club_logo_page_content: [
    { source: "annotated_image_url", asset: "annotated_image_asset_id" },
    { source: "map_image_url", asset: "map_image_asset_id" },
  ],
  homepage_slideshow_photos: [
    { source: "url", asset: "media_asset_id" },
  ],
  league_standings: [{ source: "logo_url", asset: "logo_asset_id" }],
  matches: [
    { source: "opponent_logo_url", asset: "opponent_logo_asset_id" },
    { source: "sponsor_logo_url", asset: "sponsor_logo_asset_id" },
  ],
  player_photos: [{ source: "url", asset: "media_asset_id" }],
  program_media: [{ source: "url", asset: "media_asset_id" }],
  players: [{ source: "photo_url", asset: "photo_asset_id" }],
  shop_carousel_photos: [{ source: "url", asset: "media_asset_id" }],
  shop_kit_photos: [{ source: "url", asset: "media_asset_id" }],
  site_branding: [
    { source: "club_logo_path", asset: "club_logo_asset_id" },
  ],
  site_sponsor_logos: [
    { source: "logo_url", asset: "media_asset_id" },
  ],
  staff: [{ source: "photo_url", asset: "photo_asset_id" }],
};

function attachMediaReferences(
  table: string,
  payload: unknown,
): unknown {
  const fields = MEDIA_REFERENCE_FIELDS[table] ?? [];
  const attach = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const row = withoutClientTenantIdentity(
      value as Record<string, unknown>,
    );
    // Select responses include the server-resolved tenant key. Never echo it
    // back from a browser mutation; the admin route injects the verified club.
    for (const { source, asset } of fields) {
      // Only act when the mutation actually touches this field. A save that
      // never includes it (e.g. editing an unrelated field) must not disturb
      // whatever asset reference is already stored.
      if (!Object.prototype.hasOwnProperty.call(row, source)) continue;
      const sourceValue = row[source];
      if (typeof sourceValue !== "string" || sourceValue.trim() === "") {
        // The url was explicitly cleared (an admin removing an image, not
        // replacing it). Without this, the asset reference survived a removal
        // and resolveMediaReferences kept re-deriving the old url from it on
        // every public read -- the admin looked correct because it only shows
        // local draft state, never re-resolving from the database.
        row[asset] = null;
        continue;
      }
      const media = publishedMedia.get(sourceValue);
      if (media) row[asset] = media.assetId;
    }
    return row;
  };
  return Array.isArray(payload) ? payload.map(attach) : attach(payload);
}

class AdminQueryBuilder implements PromiseLike<AdminResult> {
  private request: Record<string, unknown>;
  private readonly table: string;

  constructor(table: string) {
    this.table = table;
    this.request = {
      table,
      operation: "select",
      columns: "*",
      filters: [] as Filter[],
    };
  }

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    this.request.columns = columns;
    this.request.count = options?.count;
    this.request.head = options?.head;
    return this;
  }

  insert(payload: unknown) {
    this.request.operation = "insert";
    this.request.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.request.operation = "update";
    this.request.payload = payload;
    return this;
  }

  upsert(
    payload: unknown,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.request.operation = "upsert";
    this.request.payload = payload;
    this.request.onConflict = options?.onConflict;
    return this;
  }

  delete() {
    this.request.operation = "delete";
    return this;
  }

  private filter(kind: Filter["kind"], column: string, value: unknown) {
    (this.request.filters as Filter[]).push({ kind, column, value });
    return this;
  }

  eq(column: string, value: unknown) {
    return this.filter("eq", column, value);
  }

  neq(column: string, value: unknown) {
    return this.filter("neq", column, value);
  }

  gt(column: string, value: unknown) {
    return this.filter("gt", column, value);
  }

  in(column: string, value: unknown[]) {
    return this.filter("in", column, value);
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.request.order = {
      column,
      ascending: options?.ascending ?? true,
    };
    return this;
  }

  limit(value: number) {
    this.request.limit = value;
    return this;
  }

  single() {
    this.request.single = "single";
    return this;
  }

  maybeSingle() {
    this.request.single = "maybeSingle";
    return this;
  }

  private async execute(): Promise<AdminResult> {
    if (this.request.payload) {
      this.request.payload = attachMediaReferences(
        this.table,
        this.request.payload,
      );
    }
    const response = await fetch("/api/admin/data", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.request),
    });
    const result = (await response.json()) as AdminResult;
    if (!response.ok && !result.error) {
      return {
        data: null,
        count: null,
        error: {
          code: "ADMIN_REQUEST_FAILED",
          message: `Admin request failed with ${response.status}`,
        },
      };
    }
    return result;
  }

  then<TResult1 = AdminResult, TResult2 = never>(
    onfulfilled?:
      | ((value: AdminResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

const MEDIA_BUCKETS: Record<
  string,
  { surface: string; kind: "photo" | "graphic" }
> = {
  "about-page": { surface: "about", kind: "photo" },
  Aboutassets: { surface: "about", kind: "graphic" },
  contact: { surface: "contact", kind: "photo" },
  flags: { surface: "roster", kind: "graphic" },
  homepage: { surface: "homepage", kind: "photo" },
  logos: { surface: "branding", kind: "graphic" },
  logos_v2: { surface: "branding", kind: "graphic" },
  "opponent-logos": { surface: "schedule", kind: "graphic" },
  "player-action-photos": { surface: "roster", kind: "photo" },
  programs: { surface: "programs", kind: "photo" },
  "roster-images": { surface: "roster", kind: "photo" },
  shop: { surface: "shop", kind: "photo" },
  sponsors: { surface: "branding", kind: "graphic" },
  "staff-images": { surface: "roster", kind: "photo" },
  standings: { surface: "standings", kind: "graphic" },
  tryouts: { surface: "tryouts", kind: "photo" },
};

function mediaError(code: string, message = code) {
  return { code, message };
}

async function parseJson(response: Response) {
  try {
    return (await response.json()) as Record<string, any>;
  } catch {
    return {};
  }
}

function registerPublishedMedia(
  media: PublishedMedia,
  aliases: readonly string[],
) {
  for (const alias of [
    ...aliases,
    media.assetId,
    media.storagePath,
    media.publicUrl,
  ]) {
    publishedMedia.set(alias, media);
  }
}

export function createClient() {
  const authClient = createAuthClient();
  return {
    auth: authClient.auth,
    from(table: string) {
      return new AdminQueryBuilder(table);
    },
    storage: {
      from(bucket: string) {
        const configuration = MEDIA_BUCKETS[bucket];
        return {
          async upload(
            requestedPath: string,
            file: File,
            _options?: Record<string, unknown>,
          ) {
            if (!configuration) {
              return {
                data: null,
                error: mediaError(
                  "UNSUPPORTED_MEDIA_SURFACE",
                  `The ${bucket} bucket is not mapped to secure media`,
                ),
              };
            }
            const authorizeResponse = await fetch(
              "/api/admin/media/authorize",
              {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  surface: configuration.surface,
                  kind: configuration.kind,
                  fileName: file.name,
                  mimeType: file.type,
                  size: file.size,
                }),
              },
            );
            const authorizeResult = await parseJson(authorizeResponse);
            if (!authorizeResponse.ok) {
              // A missing `error` key means the response did not come from the
              // authorize route at all — a platform error page, a tenant 404
              // from middleware, or a gateway timeout. Reporting a bare
              // "MEDIA_AUTHORIZATION_FAILED" for that hid which of the two it
              // was; the HTTP status is what distinguishes them.
              const fallback = mediaError(
                "MEDIA_AUTHORIZATION_UNAVAILABLE",
                `The upload could not be authorized: the server responded ${authorizeResponse.status} ${authorizeResponse.statusText || ""}`.trim() +
                  ". This is not a permissions error — the request did not reach the upload service.",
              );
              const reported = authorizeResult.error as
                | { code?: string; message?: string }
                | undefined;
              return {
                data: null,
                error: reported?.code
                  ? mediaError(
                      reported.code,
                      reported.message ?? reported.code,
                    )
                  : fallback,
              };
            }
            const authorization =
              authorizeResult as MediaUploadAuthorization;
            const { error: stagingError } = await authClient.storage
              .from("onzio-upload-staging")
              .uploadToSignedUrl(
                authorization.path,
                authorization.token,
                file,
                {
                  contentType: file.type,
                  upsert: false,
                },
              );
            if (stagingError) {
              return {
                data: null,
                error: mediaError(
                  "STAGING_UPLOAD_FAILED",
                  stagingError.message,
                ),
              };
            }
            const finalizeResponse = await fetch(
              "/api/admin/media/finalize",
              {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  authorization: authorization.authorization,
                }),
              },
            );
            const finalizeResult = await parseJson(finalizeResponse);
            if (!finalizeResponse.ok || !finalizeResult.data) {
              return {
                data: null,
                error:
                  finalizeResult.error ??
                  mediaError("MEDIA_FINALIZATION_FAILED"),
              };
            }
            const media = finalizeResult.data as PublishedMedia;
            registerPublishedMedia(media, [
              requestedPath,
              `${bucket}/${requestedPath}`,
            ]);
            return {
              data: {
                path: media.storagePath,
                fullPath: `onzio-media/${media.storagePath}`,
                assetId: media.assetId,
              },
              error: null,
            };
          },
          async remove(paths: string[]) {
            const assets = [
              ...new Map(
                paths
                  .map((path) => publishedMedia.get(path))
                  .filter((media): media is PublishedMedia => Boolean(media))
                  .map((media) => [media.assetId, media]),
              ).values(),
            ];
            for (const media of assets) {
              const response = await fetch("/api/admin/media/cleanup", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetId: media.assetId }),
              });
              const result = await parseJson(response);
              if (!response.ok) {
                return {
                  data: null,
                  error:
                    result.error ?? mediaError("MEDIA_CLEANUP_FAILED"),
                };
              }
            }
            return { data: assets.map((asset) => asset.storagePath), error: null };
          },
          getPublicUrl(requestedPath: string) {
            const media =
              publishedMedia.get(requestedPath) ??
              publishedMedia.get(`${bucket}/${requestedPath}`);
            return {
              data: { publicUrl: media?.publicUrl ?? "" },
              error: media
                ? null
                : mediaError(
                    "MEDIA_NOT_FINALIZED",
                    "The media upload has not been finalized",
                  ),
            };
          },
        };
      },
    },
  };
}
