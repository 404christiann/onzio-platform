"use client";

import {
  ChevronDown,
  Menu,
  X,
} from "@/components/admin/icons";
import Link from "next/link";
import { GROUP_ICONS, ROUTE_ICONS } from "@/components/admin/adminRouteIcons";
import guided from "@/components/admin/AdminGuided.module.css";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "@/components/ResilientImage";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminAccountMenu } from "@/components/admin/AdminAccountMenu";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import {
  AdminRouteSearch,
  type AdminSearchRoute,
} from "@/components/admin/AdminRouteSearch";
import { AdminThemeToggle } from "@/components/admin/AdminThemeToggle";
import { shellTopTrail } from "@/components/admin/shellTopTrail";
import { PageFrameRegistryContext } from "@/components/admin/ui/editor-kit/pageFrameRegistry";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  getAdminBreadcrumb,
  getAdminGroupForPathname,
  getVisibleAdminNavigation,
  getVisibleAdminRoutes,
  type AdminRouteAccessContext,
  type AdminVisibleRoute,
} from "@/lib/admin-route-manifest";
import { createClient } from "@/lib/supabase-browser";

function isPathActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * What the manifest reads to decide which rows this person sees. The shell and
 * the Website hub page share it, so the hub lists exactly what the sidebar can reach.
 */
export function useAdminRouteAccess(isBillingAuthorized = false): AdminRouteAccessContext {
  const club = useClubContext();
  const { flags: adminFlags } = useAdminPortal();
  const canMutateContent =
    club.lifecycle === "onboarding" ||
    (club.lifecycle === "active" &&
      (club.kind === "demo" ||
        club.kind === "test" ||
        club.publicAccess === "live" ||
        club.publicAccess === "grace"));
  return useMemo<AdminRouteAccessContext>(
    () => ({
      role: club.role,
      presentationTemplateKey: club.presentationTemplateKey,
      clubSlug: club.slug,
      isBillingAuthorized,
      canMutateContent,
      storeEnabled: club.storeEnabled,
      adminFlags,
    }),
    [adminFlags, canMutateContent, club.presentationTemplateKey, club.role, club.slug, club.storeEnabled, isBillingAuthorized],
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const requestNavigation = useUnsavedGuard();
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isBillingAuthorized, setIsBillingAuthorized] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const accessContext = useAdminRouteAccess(isBillingAuthorized);
  const navigation = useMemo(
    () => getVisibleAdminNavigation(accessContext),
    [accessContext],
  );
  const routes = useMemo(() => getVisibleAdminRoutes(accessContext), [accessContext]);
  // True while the page renders a PageFrame, which carries the canonical Breadcrumb landmark.
  const [pageHasFrame, setPageHasFrame] = useState(false);
  const hubOverflow = useMemo(
    () => navigation.flatMap((entry) => (entry.type === "group" ? (entry.overflowRoutes ?? []) : [])),
    [navigation],
  );
  const breadcrumb = getAdminBreadcrumb(pathname, accessContext);
  const topTrail = shellTopTrail(breadcrumb, pageHasFrame);
  const slotTrail = shellTopTrail(breadcrumb, false); // what the slot holds; hidden, not removed, on a framed page
  const activeGroup = getAdminGroupForPathname(pathname, accessContext);
  const [openGroupKey, setOpenGroupKey] = useState(activeGroup);

  useEffect(() => {
    setOpenGroupKey(activeGroup);
    setSidebarOpen(false);
  }, [activeGroup, pathname]);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    void fetch("/api/stripe/billing-admin", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setIsBillingAuthorized(Boolean(data?.isBillingAdmin)))
      .catch(() => setIsBillingAuthorized(false));
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  const closeSidebar = useCallback((restoreFocus: boolean) => {
    setSidebarOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => menuTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeMobileDrawer = () => {
      if (desktop.matches) setSidebarOpen(false);
    };
    desktop.addEventListener("change", closeMobileDrawer);
    closeMobileDrawer();
    return () => desktop.removeEventListener("change", closeMobileDrawer);
  }, []);

  const handleSidebarOpenChange = useCallback(
    (open: boolean) => {
      if (open) setSidebarOpen(true);
      else closeSidebar(true);
    },
    [closeSidebar],
  );

  function handleSignOut(opener: HTMLElement) {
    requestNavigation({
      kind: "page",
      label: "Sign in",
      opener,
      continue: () => {
        void (async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push("/admin/login");
          router.refresh();
        })();
      },
    });
  }

  const groupLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const entry of navigation) {
      if (entry.type === "group") labels.set(entry.id, entry.label);
    }
    return labels;
  }, [navigation]);
  const searchRoutes = useMemo<AdminSearchRoute[]>(
    () =>
      routes.map((route) => ({
        href: route.href,
        label: route.label,
        groupLabel: route.groupId ? groupLabels.get(route.groupId) : undefined,
        keywords: route.searchKeywords,
      })),
    [groupLabels, routes],
  );
  const currentRoute = routes.find((route) => isPathActive(pathname, route.href));

  const renderNavLink = (route: AdminVisibleRoute) => {
    const Icon = ROUTE_ICONS[route.iconKey];
    // On a page that only the hub lists, "All website pages" is the lit row.
    const active =
      isPathActive(pathname, route.href) ||
      hubOverflow.some((overflow) => route.id === "website-pages" && isPathActive(pathname, overflow.href));
    return (
      <SidebarMenuItem key={route.href}>
        <SidebarMenuButton
          render={<Link href={route.href} />}
          onClick={(event) => { if (!event.defaultPrevented) closeSidebar(false); }}
          isActive={active}
          className="h-11 gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-6"
        >
          <Icon
            className={active ? "text-primary" : "text-sidebar-foreground/45"}
            aria-hidden="true"
          />
          <span>{route.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      className={`admin-portal bg-background text-foreground ${guided.portal}`}
      style={{ "--sidebar-width": "264px" } as React.CSSProperties}
    >
      <Sidebar id="admin-sidebar" className="border-r border-sidebar-border bg-sidebar">
        <SidebarHeader className={`flex-row items-center gap-3 border-b border-sidebar-border px-5 py-5 ${guided.sidebarHeader}`}>
          {clubLogoUrl ? (
            <Image
              src={clubLogoUrl}
              alt={`${club.name} logo`}
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-lg border border-sidebar-border bg-white object-contain p-1"
              fallback={(
                <span role="img" aria-label={`${club.name} logo unavailable`} className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                  {club.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3)}
                </span>
              )}
            />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
              {club.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 3)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">{club.name}</p>
            <p className="mt-0.5 text-xs text-sidebar-foreground/70">Club administration</p>
          </div>
          <button
            type="button"
            onClick={() => closeSidebar(true)}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring lg:hidden"
            aria-label="Close admin navigation"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </SidebarHeader>

        <SidebarContent
          className={"admin-nav-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y gap-1 px-3 py-4 " + guided.sidebarContent}
          style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable" }}
          aria-label="Admin navigation"
          tabIndex={0}
        >
          <nav aria-label="Primary admin navigation">
            {navigation.map((entry) => {
              if (entry.type === "link") {
                return (
                  <SidebarMenu key={entry.route.href} className="mb-1">
                    {renderNavLink(entry.route)}
                  </SidebarMenu>
                );
              }

              const GroupIcon = GROUP_ICONS[entry.iconKey];
              const isOpen = openGroupKey === entry.id;
              const panelId = `admin-nav-group-${entry.id}`;
              const headerId = `${panelId}-header`;
              return (
                <SidebarGroup key={entry.id} className="mb-1 p-0">
                  <SidebarGroupLabel
                    render={<button type="button" />}
                    id={headerId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() =>
                      setOpenGroupKey((previous) => (previous === entry.id ? null : entry.id))
                    }
                    className="h-11 w-full gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg:first-child]:size-6"
                  >
                    <GroupIcon className="text-sidebar-foreground/45" aria-hidden="true" />
                    <span className="whitespace-nowrap text-left">{entry.label}</span>
                    <ChevronDown
                      className={`ml-auto size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </SidebarGroupLabel>
                  <SidebarGroupContent
                    id={panelId}
                    role="region"
                    aria-labelledby={headerId}
                    hidden={!isOpen}
                  >
                    <SidebarMenu className="mt-1 gap-1 pl-4">
                      {entry.routes.map(renderNavLink)}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </nav>
        </SidebarContent>

        <SidebarFooter
          className={"border-t border-sidebar-border px-5 py-4 " + guided.sidebarFooter}
          style={{ paddingBottom: "max(1rem, var(--admin-safe-area-bottom))" }}
        >
          <div className="flex items-baseline gap-1.5 text-xs text-sidebar-foreground/70">
            <span>Powered by</span>
            {/* Pre-trimmed 350x92 crop (ink bbox x76-425/y196-287 of the 500x500
                master) so the box hugs the artwork exactly — no invisible padding
                to throw off alignment. The mark's ink bottom is its own baseline
                (o-n-z-i-o, no descenders), so items-baseline sits it on the same
                baseline as the 12px text; at 10px tall its letter bodies (64/92
                of the ink — the i-dot tops it out) land just under the text's
                cap-height, reading proportionate, not dominant. The asset
                is white line art: brightness-0 flattens it to black for the light
                sidebar; the data-admin-theme ancestor variant restores white in
                dark mode (Tailwind's `dark:` variant is media-query based here,
                not wired to the admin theme toggle). */}
            <Image
              src="/images/onzio/onzio-wordmark-white-trimmed.png"
              alt="ONZIO"
              width={350}
              height={92}
              className="h-2.5 w-auto shrink-0 brightness-0 [[data-admin-theme=dark]_&]:brightness-100"
            />
          </div>
        </SidebarFooter>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`sticky top-0 z-20 flex min-h-[72px] items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur sm:gap-3 sm:px-6 lg:px-8 ${guided.shellHeader}`}>
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            aria-label="Open admin navigation"
            aria-controls="admin-sidebar"
            aria-expanded={sidebarOpen}
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          {/* Under lg the sidebar is a drawer, so its crest is out of sight: the bar shows the club's own logo, from the
              same branding source as the public site and the sidebar. */}
          <Link
            href="/admin"
            data-admin-header-logo=""
            className="flex h-11 min-w-0 max-w-20 shrink items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-28 lg:hidden"
          >
            {clubLogoUrl ? (
              <Image
                src={clubLogoUrl}
                alt={club.name}
                width={112}
                height={32}
                className="h-8 w-auto max-w-full rounded-md bg-white object-contain p-0.5"
                fallback={<span className="truncate text-sm font-semibold text-foreground">{club.name}</span>}
              />
            ) : (
              <span className="truncate text-sm font-semibold text-foreground">{club.name}</span>
            )}
          </Link>
          {/* A framed page keeps the slot and its content but invisible (no box, no landmark, no focus), so the search box and
              theme button never move when the page registers its frame after first paint. */}
          <div className={topTrail === "none" ? "invisible hidden min-w-0 xl:block" : "hidden min-w-0 xl:block"} aria-hidden={topTrail === "none" || undefined}>
            {slotTrail === "breadcrumb" && breadcrumb ? (
              <nav aria-label="Breadcrumb">
                <ol className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  {breadcrumb.map((crumb, index) => (
                    <li
                      key={`${index}-${crumb}`}
                      aria-current={index === breadcrumb.length - 1 ? "page" : undefined}
                      className={index === breadcrumb.length - 1 ? "font-semibold text-foreground" : undefined}
                    >
                      {index > 0 && <span aria-hidden="true" className="mr-1.5">/</span>}
                      {crumb}
                    </li>
                  ))}
                </ol>
              </nav>
            ) : (
              <p className="truncate text-sm font-semibold text-foreground">
                {currentRoute?.label ?? "Admin"}
              </p>
            )}
          </div>
          <AdminRouteSearch routes={searchRoutes} />
          <AdminThemeToggle />
          <AdminAccountMenu email={userEmail} role={club.role} onSignOut={handleSignOut} />
        </header>

        <main className={"min-w-0 flex-1 overflow-x-clip bg-background p-4 sm:p-6 lg:p-8 " + guided.shellMain}>
          {club.kind === "customer" && club.publicAccess === "grace" ? (
            <div className="mx-auto mb-6 max-w-7xl rounded-lg border border-billing-warning bg-billing-warning-soft px-4 py-3 text-sm text-billing-warning-foreground">
              Billing needs attention. Content editing remains available during the grace period.
              {isBillingAuthorized ? (
                <>
                  {" "}
                  <Link href="/admin/payments" className="font-semibold underline underline-offset-2">
                    Review payment details
                  </Link>
                  .
                </>
              ) : null}
            </div>
          ) : null}
          {club.kind === "customer" && club.publicAccess === "suspended" ? (
            <div className="mx-auto mb-6 max-w-7xl rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Content changes are paused while billing is suspended.
              {isBillingAuthorized ? (
                <>
                  {" "}
                  <Link href="/admin/payments" className="font-semibold underline underline-offset-2">
                    Review payment details
                  </Link>
                  .
                </>
              ) : (
                " Contact a club owner to restore access."
              )}
            </div>
          ) : null}
          <PageFrameRegistryContext.Provider value={setPageHasFrame}>{children}</PageFrameRegistryContext.Provider>
        </main>
      </div>
    </SidebarProvider>
  );
}
