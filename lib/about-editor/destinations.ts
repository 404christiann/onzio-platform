import { activeTemplateRegistration, parsePresentationDocument, routeRegistry, type TemplateKey } from "@/packages/presentation";
import type { ClubContext } from "@/lib/club-context";
import { codeSiteAdminForTemplateKey } from "@/lib/code-site-admin";
import type { SiteRouteOption } from "@/lib/site-routes";
import type { createClient } from "@/lib/supabase-server";

type RouteKey = keyof typeof routeRegistry;
type ServerClient = Awaited<ReturnType<typeof createClient>>;

const LABELS: Record<RouteKey, string> = {
  home: "Home",
  roster: "Roster",
  schedule: "Schedule",
  club: "About",
  "club-logo": "Club Logo",
  store: "Shop",
  sponsors: "Sponsors",
  staff: "Staff",
  standings: "Standings",
  stats: "Stats",
  tryouts: "Tryouts",
  programs: "Programs",
  contact: "Contact",
};

/** Only routes in a published navigation and supported by its template are offered. */
export function aboutDestinationOptions(
  routeKeys: readonly string[],
  templateKey: TemplateKey | null,
  storeEnabled: boolean,
): SiteRouteOption[] {
  const template = activeTemplateRegistration(templateKey);
  if (!template) return [];
  const supported = new Set<string>(template.supportedRoutes);
  const result: SiteRouteOption[] = [];
  const seen = new Set<string>();
  for (const key of routeKeys) {
    if (!supported.has(key) || !(key in routeRegistry) || seen.has(key)) continue;
    if (key === "store" && !storeEnabled) continue;
    if (key === "tryouts" && !codeSiteAdminForTemplateKey(templateKey)?.tryouts.routeVisible) continue;
    seen.add(key);
    const route = key as RouteKey;
    result.push({ href: routeRegistry[route].path, label: LABELS[route] });
  }
  return result;
}

/** Resolve routes from this club's published presentation. */
export async function loadAboutDestinationOptions(
  supabase: ServerClient,
  club: Pick<ClubContext, "id" | "presentationTemplateKey" | "storeEnabled">,
): Promise<SiteRouteOption[]> {
  const onzio = supabase.schema("onzio");
  const { data: state, error: stateError } = await onzio
    .from("presentation_state")
    .select("published_document_id")
    .eq("club_id", club.id)
    .maybeSingle();
  if (stateError) throw stateError;

  if (!state?.published_document_id) {
    const template = activeTemplateRegistration(club.presentationTemplateKey);
    if (!template) return [];
    return aboutDestinationOptions(template.defaultRoutes, club.presentationTemplateKey, club.storeEnabled);
  }

  const { data: row, error: documentError } = await onzio
    .from("presentation_documents")
    .select("configuration")
    .eq("club_id", club.id)
    .eq("id", state.published_document_id)
    .maybeSingle();
  if (documentError || !row?.configuration) throw documentError ?? new Error("Published presentation is unavailable");
  const document = parsePresentationDocument(row.configuration, { surface: "production" });
  return aboutDestinationOptions(
    document.navigation.groups.flatMap((group) => group.routes),
    club.presentationTemplateKey,
    club.storeEnabled,
  );
}
