import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeHostname } from "@/lib/tenant";

const PUBLIC_TENANT_PATHS = new Set([
  "/",
  "/roster",
  "/schedule",
  "/shop",
  "/sponsors",
  "/staff",
  "/stats",
  "/club/about",
  "/club/logo",
  "/club-logo",
  "/programs",
  "/contact",
  "/tryouts",
]);

const PROGRAM_SLUG_PATTERN = "[a-z][a-z0-9-]*";
const PROGRAM_DETAIL_PATH = new RegExp(`^/programs/${PROGRAM_SLUG_PATTERN}$`);
const REGISTRATION_PATH =
  /^\/register\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/confirmation)?$/;

function isPublicTenantPath(pathname: string): boolean {
  if (PUBLIC_TENANT_PATHS.has(pathname)) return true;
  return (
    /^\/roster\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname) ||
    /^\/schedule\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname) ||
    PROGRAM_DETAIL_PATH.test(pathname) ||
    REGISTRATION_PATH.test(pathname)
  );
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

/**
 * `DCFC-D117`: the production site retains `noindex, nofollow` **through
 * launch**. Indexing is a separate later approval carried by `DCFC-1003`, after
 * observation closes — so this is deliberately unconditional and must not be
 * keyed to `public_access`. Going live at `DCFC-903` must not make the site
 * indexable as a side effect.
 *
 * When `DCFC-1003` grants indexing, add an explicit per-club opt-in that
 * defaults to blocked, rather than reintroducing a `public_access` branch here.
 */
function applyTenantRobotsPolicy(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/api/stripe/webhook" ||
    request.nextUrl.pathname === "/api/stripe/connect-webhook"
  ) {
    return NextResponse.next({ request });
  }
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

  const onzio = supabase.schema("onzio");

  const resolveTenant = async (): Promise<ResolvedTenant | null> => {
    let resolved: ResolvedTenant | null = null;

    if (
      hostname.endsWith(".localhost") ||
      (hostname === "localhost" &&
        process.env.NODE_ENV === "development" &&
        process.env.ONZIO_LOCAL_TENANT_SLUG)
    ) {
      const slug = hostname.endsWith(".localhost")
        ? hostname.slice(0, -".localhost".length)
        : process.env.ONZIO_LOCAL_TENANT_SLUG!;
      const { data } = await onzio
        .from("clubs")
        .select("id, slug, lifecycle, public_access")
        .eq("slug", slug)
        .maybeSingle();
      if (data) {
        resolved = {
          id: data.id,
          slug: data.slug,
          lifecycle: data.lifecycle,
          publicAccess: data.public_access,
        };
      }
    } else {
      const { data: domain } = await onzio
        .from("club_domains")
        .select(
          "club_id, clubs!inner(id, slug, lifecycle, public_access)",
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
  if (
    runtimeAccess === "suspended" &&
    !isAdminRequest &&
    !isBillingRequest
  ) {
    return applyTenantRobotsPolicy(notFound());
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
    return applyTenantRobotsPolicy(
      NextResponse.redirect(new URL("/admin/payments", request.url), 303),
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-onzio-club-id");
  requestHeaders.delete("x-onzio-club-slug");
  requestHeaders.delete("x-onzio-user-id");
  requestHeaders.set("x-onzio-club-id", tenant.id);
  requestHeaders.set("x-onzio-club-slug", tenant.slug);
  if (user) requestHeaders.set("x-onzio-user-id", user.id);

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
    return applyTenantRobotsPolicy(copyCookies(sessionResponse, rewritten));
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Vary", "Host");
  return applyTenantRobotsPolicy(copyCookies(sessionResponse, response));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
