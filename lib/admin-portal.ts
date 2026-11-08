import { clubTimeZoneOrDefault, DEFAULT_CLUB_TIME_ZONE } from "@/lib/club-time";

// ADMIN-RE-02: which admin a club sees, its slice flags and its time zone.
// Read separately from tenant resolution (lib/club-context.ts must never select
// these columns: the 2026-08-14 outage), and fail-safe: any error, a lagging
// migration or an unexpected value falls back to the classic admin.

export type AdminPortal = "classic" | "reimagined";
export type AdminFlags = Readonly<Record<string, boolean>>;

export type AdminPortalSettings = {
  portal: AdminPortal;
  flags: AdminFlags;
  timeZone: string;
  /** True once the time zone was confirmed, by an owner's browser or by Onzio. */
  timeZoneConfirmed: boolean;
};

export const CLASSIC_ADMIN_PORTAL: AdminPortalSettings = Object.freeze({
  portal: "classic",
  flags: Object.freeze({}),
  timeZone: DEFAULT_CLUB_TIME_ZONE,
  // Unknown counts as confirmed, so a failed read never triggers the automatic set.
  timeZoneConfirmed: true,
});

// Type-only import: lib/admin-portal.ts is also imported by the client provider.
type ServerClient = Awaited<ReturnType<typeof import("@/lib/supabase-server").createClient>>;

function booleanFlags(value: unknown): AdminFlags {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  );
}

export function parseAdminPortalRow(row: unknown): AdminPortalSettings {
  if (!row || typeof row !== "object") return CLASSIC_ADMIN_PORTAL;
  const record = row as Record<string, unknown>;
  return {
    portal: record.admin_portal === "reimagined" ? "reimagined" : "classic",
    flags: booleanFlags(record.admin_flags),
    timeZone: clubTimeZoneOrDefault(record.time_zone),
    timeZoneConfirmed: record.time_zone_set_at !== null,
  };
}

export async function readAdminPortal(
  supabase: ServerClient,
  clubId: string,
): Promise<AdminPortalSettings> {
  try {
    const { data, error } = await supabase
      .schema("onzio")
      .from("clubs")
      .select("admin_portal, admin_flags, time_zone, time_zone_set_at")
      .eq("id", clubId)
      .maybeSingle();
    if (error || !data) return CLASSIC_ADMIN_PORTAL;
    return parseAdminPortalRow(data);
  } catch {
    return CLASSIC_ADMIN_PORTAL;
  }
}
