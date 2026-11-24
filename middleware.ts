import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeHostname } from "@/lib/tenant";
import { isPublicSiteOpen } from "@/lib/club-access";
import { ROSE_CITY_PREVIEW_SLUG, roseCityPreviewHost } from "@/lib/rose-city-preview";
import { CINEMATIC_PLACEHOLDER_ROUTES } from "@/lib/cinematic-routes";
import { parsePresentationDocument, templateKey } from "@/packages/presentation";
import { isPublicTenantPath } from "@/lib/public-tenant-paths";
import { SITE_INDEXABLE_HEADER, applyRobotsHeader, siteIndexable } from "@/lib/robots";

export { isPublicTenantPath };

// Static files in public/ that the matcher below does not already skip
// (it only skips images). Never under /api or /admin.
const STATIC_PUBLIC_FILE = /^\/(?!api(?:\/|$)|admin(?:\/|$)|_clubs(?:\/|$)|%5fclubs(?:\/|$))[^?#]*\.(?:otf|ttf|woff2?|mp4|webm|txt|json)$/i;

function isInternalClubPath(pathname: string, slug: string): boolean {
  const internalPath = pathname.replace(/^\/%5fclubs(?=\/|$)/i, "/_clubs");
  return internalPath === `/_clubs/${slug}` || internalPath.startsWith(`/_clubs/${slug}/`);
}

/** Public tenant surface that is closed until the club's public_access opens it. */
function isHeldPublicSiteRequest(pathname: string, method: string, slug: string): boolean {
  return isPublicTenantPath(pathname) ||
    isInternalClubPath(pathname, slug) ||
    (pathname === "/api/register" && method === "POST");
}

/** Vercel cron routes (vercel.json `crons`): bearer-authenticated, not tenant-scoped. */
export function isCronPath(pathname: string): boolean {
  return /^\/api\/cron\/[a-z0-9-]+$/.test(pathname);
}

/** Protected endpoints that must resolve their tenant on fallback deployment hosts. */
export function requiresTenantFallback(pathname: string): boolean {
  return pathname === "/admin/payments" ||
    pathname === "/api/stripe/checkout" ||
    pathname === "/api/stripe/portal" ||
    pathname === "/api/stripe/connect" ||
    pathname === "/api/stripe/billing-admin" ||
    pathname.startsWith("/api/admin/registrations/");
}

type ResolvedTenant = {
  id: string;
  slug: string;
  lifecycle: string;
  publicAccess: string;
  /** The request host is this club's primary verified domain. */
  isPrimaryDomain: boolean;
};

function notFound(): NextResponse {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

function copyCookies(source: NextResponse, target: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

export async function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/api/stripe/webhook" ||
    request.nextUrl.pathname === "/api/stripe/connect-webhook"
  ) {
    return NextResponse.next({ request });
  }
  if (isCronPath(request.nextUrl.pathname)) {
    // Vercel invokes crons on the deployment URL, which is no club's domain, so tenant
    // resolution would 404 them. Each cron route checks CRON_SECRET itself and is not
    // tenant-scoped; client copies of the tenant headers are dropped so none can reach it.
    const headers = new Headers(request.headers);
    headers.delete("x-onzio-club-id");
    headers.delete("x-onzio-club-slug");
    headers.delete("x-onzio-user-id");
    return NextResponse.next({ request: { headers } });
  }
  // One decider for indexing (lib/robots.ts): every response below, including each
  // 404 and redirect, gets its robots header from the state the handler resolves.
  const robotsState: RobotsState = { publicAccess: undefined, host: null, isPrimaryDomain: false };
  const response = await handleTenantRequest(request, robotsState);
  return applyRobotsHeader(response, {
    vercelEnv: process.env.VERCEL_ENV,
    host: robotsState.host,
    path: request.nextUrl.pathname,
    publicAccess: robotsState.publicAccess,
    isPrimaryDomain: robotsState.isPrimaryDomain,
  });
}

/** What the handler learned about the request, for the robots decider. */
type RobotsState = {
  publicAccess: unknown;
  host: string | null;
  isPrimaryDomain: boolean;
};

async function handleTenantRequest(request: NextRequest, robotsState: RobotsState): Promise<NextResponse> {
  const isAdminRequest =
    request.nextUrl.pathname === "/admin" ||
    request.nextUrl.pathname.startsWith("/admin/");
  const isBillingRequest = requiresTenantFallback(request.nextUrl.pathname);

  let sessionResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "onzio" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          sessionResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            sessionResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let hostname: string;
  try {
    hostname = normalizeHostname(request.headers.get("host") ?? "");
  } catch {
    return notFound();
  }
  robotsState.host = hostname;

  // RC-PREVIEW: on the declared Preview host only, Rose City's public pages are
  // readable despite the hold. Admin, API and every non-GET/HEAD stay closed.
  const isRoseCityPreviewRequest = hostname === roseCityPreviewHost();
  if (
    isRoseCityPreviewRequest &&
    !(
      (request.method === "GET" || request.method === "HEAD") &&
      (isPublicTenantPath(request.nextUrl.pathname) ||
        isInternalClubPath(request.nextUrl.pathname, ROSE_CITY_PREVIEW_SLUG) ||
        STATIC_PUBLIC_FILE.test(request.nextUrl.pathname))
    )
  ) {
    return notFound();
  }

  const onzio = supabase.schema("onzio");

  const resolveTenant = async (): Promise<ResolvedTenant | null> => {
    let resolved: ResolvedTenant | null = null;

    const directSlug = isRoseCityPreviewRequest
      ? ROSE_CITY_PREVIEW_SLUG
      : hostname.endsWith(".localhost")
        ? hostname.slice(0, -".localhost".length)
        : hostname === "localhost" && process.env.NODE_ENV === "development"
          ? process.env.ONZIO_LOCAL_TENANT_SLUG
          : undefined;

    if (directSlug) {
      const { data } = await onzio
        .from("clubs")
        .select("id, slug, lifecycle, public_access")
        .eq("slug", directSlug)
        .maybeSingle();
      if (data) {
        resolved = {
          id: data.id,
          slug: data.slug,
          lifecycle: data.lifecycle,
          publicAccess: data.public_access,
          isPrimaryDomain: false,
        };
      }
    } else {
      const { data: domain } = await onzio
        .from("club_domains")
        .select(
          "club_id, is_primary, clubs!inner(id, slug, lifecycle, public_access)",
        )
        .eq("hostname", hostname)
        .eq("environment", process.env.ONZIO_ENVIRONMENT!)
        .eq("active", true)
        .not("verified_at", "is", null)
        .maybeSingle();
      const clubValue = domain?.clubs;
      let club = (Array.isArray(clubValue) ? clubValue[0] : clubValue) as
        | {
            id: string;
            slug: string;
            lifecycle: string;
            public_access: string;
          }
        | null
        | undefined;
      if (!club && (isAdminRequest || isBillingRequest)) {
        const { data: rpcResolved } = await onzio
          .rpc("resolve_verified_tenant", {
            p_hostname: hostname,
            p_environment: process.env.ONZIO_ENVIRONMENT!,
          })
          .maybeSingle();
        club = rpcResolved as typeof club;
      }
      if (club) {
        resolved = {
          id: club.id,
          slug: club.slug,
          lifecycle: club.lifecycle,
          publicAccess: club.public_access,
          // Only the domain-table lookup can prove the host is the canonical one;
          // the admin/billing RPC fallback never does.
          isPrimaryDomain: domain?.is_primary === true,
        };
      }
    }
    return resolved;
  };

  const [
    {
      data: { user },
    },
    tenant,
  ] = await Promise.all([supabase.auth.getUser(), resolveTenant()]);

  if (
    !tenant ||
    tenant.lifecycle === "archived"
  ) {
    return notFound();
  }
  if (request.nextUrl.pathname.startsWith("/_clubs/")) {
    const internalSlug = request.nextUrl.pathname.split("/")[2] ?? "";
    if (internalSlug !== tenant.slug) return notFound();
  }

  const { data: runtimeAccess, error: runtimeAccessError } = await onzio.rpc(
    "get_club_runtime_access",
    { p_club_id: tenant.id },
  );
  if (runtimeAccessError || typeof runtimeAccess !== "string") {
    return notFound();
  }
  robotsState.publicAccess = runtimeAccess;
  robotsState.isPrimaryDomain = tenant.isPrimaryDomain;
  if (
    runtimeAccess === "suspended" &&
    !isAdminRequest &&
    !isBillingRequest
  ) {
    return notFound();
  }
  // PLAT-D024: grace keeps full admin access (content editing stays open —
  // the DB's `can_mutate_content` allows `live` and `grace`; AdminShell shows
  // the grace banner). Suspension is the single enforcement boundary: only
  // then is the admin portal locked down to the payments/billing surface.
  if (
    isAdminRequest &&
    runtimeAccess === "suspended" &&
    !isBillingRequest &&
    request.nextUrl.pathname !== "/admin/login" &&
    request.nextUrl.pathname !== "/admin/auth/callback"
  ) {
    const target = request.nextUrl.clone();
    // Next may normalize this origin to localhost during local serving. Keep
    // the already verified tenant host so billing recovery stays in this club.
    target.hostname = hostname;
    target.pathname = "/admin/payments";
    target.search = "";
    return NextResponse.redirect(target, 303);
  }

  if (
    !isPublicSiteOpen(runtimeAccess) &&
    !isRoseCityPreviewRequest &&
    isHeldPublicSiteRequest(request.nextUrl.pathname, request.method, tenant.slug)
  ) {
    return notFound();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-onzio-club-id");
  requestHeaders.delete("x-onzio-club-slug");
  requestHeaders.delete("x-onzio-user-id");
  requestHeaders.delete(SITE_INDEXABLE_HEADER);
  requestHeaders.set("x-onzio-club-id", tenant.id);
  requestHeaders.set("x-onzio-club-slug", tenant.slug);
  if (user) requestHeaders.set("x-onzio-user-id", user.id);
  // For app/robots.ts and app/sitemap.ts, which read this instead of deciding again.
  requestHeaders.set(
    SITE_INDEXABLE_HEADER,
    siteIndexable({
      vercelEnv: process.env.VERCEL_ENV,
      host: hostname,
      publicAccess: runtimeAccess,
      isPrimaryDomain: tenant.isPrimaryDomain,
    })
      ? "1"
      : "0",
  );

  if (Object.hasOwn(CINEMATIC_PLACEHOLDER_ROUTES, request.nextUrl.pathname)) {
    // Query without member cookies: public RLS exposes only the published
    // document, so an owner's newer draft cannot enable these destinations.
    // Reject here to retain an HTTP404 before Next starts streaming a shell.
    const publicClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: "onzio" }, cookies: { getAll: () => [], setAll: () => {} } },
    );
    const presentationClient = publicClient.schema("onzio");
    const { data: published, error } = await presentationClient.from("presentation_documents")
      .select("configuration").eq("club_id", tenant.id).maybeSingle();
    if (error || !published) return notFound();
    try {
      if (templateKey(parsePresentationDocument(published.configuration, { surface: "production" }).template) !== "cinematic@2") {
        return notFound();
      }
    } catch {
      return notFound();
    }
  }

  if (isPublicTenantPath(request.nextUrl.pathname)) {
    const target = request.nextUrl.clone();
    // Preserve the already-normalized tenant hostname. In local development,
    // Next may expose request.nextUrl with a localhost origin even when the
    // verified Host header is a tenant subdomain; rewriting that origin would
    // re-enter middleware as a direct internal route and fail closed.
    target.hostname = hostname;
    target.pathname = `/_clubs/${tenant.slug}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`;
    const rewritten = NextResponse.rewrite(target, {
      request: { headers: requestHeaders },
    });
    rewritten.headers.set("Vary", "Host, RSC, Next-Router-State-Tree");
    rewritten.headers.set("x-onzio-cache-tenant", tenant.id);
    return copyCookies(sessionResponse, rewritten);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Vary", "Host");
  return copyCookies(sessionResponse, response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
