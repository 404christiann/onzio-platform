"use client";

import {
  BarChart3,
  BookOpenText,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  ClipboardPenLine,
  CreditCard,
  Gauge,
  Globe2,
  Handshake,
  House,
  Mail,
  Menu,
  Palette,
  Settings2,
  ShoppingBag,
  Trophy,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
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
import {
  AdminRouteSearch,
  type AdminSearchRoute,
} from "@/components/admin/AdminRouteSearch";
import { AdminThemeToggle } from "@/components/admin/AdminThemeToggle";
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
  getAdminGroupForPathname,
  getVisibleAdminNavigation,
  getVisibleAdminRoutes,
  type AdminGroupIconKey,
  type AdminRouteAccessContext,
  type AdminRouteIconKey,
  type AdminVisibleRoute,
} from "@/lib/admin-route-manifest";
import { createClient } from "@/lib/supabase-browser";

const ROUTE_ICONS: Record<AdminRouteIconKey, LucideIcon> = {
  dashboard: Gauge,
  homepage: House,
  programs: BookOpenText,
  tryouts: CalendarCheck2,
  shop: ShoppingBag,
  about: CircleHelp,
  sponsors: Handshake,
  contact: Mail,
  seasons: CalendarRange,
  roster: Users,
  schedule: CalendarDays,
  "match-stats": BarChart3,
  "season-stats": ClipboardList,
  standings: Trophy,
  registrations: ClipboardPenLine,
  analytics: BarChart3,
  branding: Palette,
  "team-access": UserCog,
  payments: CreditCard,
};

const GROUP_ICONS: Record<AdminGroupIconKey, LucideIcon> = {
  website: Globe2,
  competition: Trophy,
  "club-settings": Settings2,
};

function isPathActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isBillingAuthorized, setIsBillingAuthorized] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  const canMutateContent =
    club.lifecycle === "onboarding" ||
    (club.lifecycle === "active" &&
      (club.kind === "demo" ||
        club.kind === "test" ||
        club.publicAccess === "live" ||
        club.publicAccess === "grace"));

  const accessContext = useMemo<AdminRouteAccessContext>(
    () => ({
      role: club.role,
      presentationTemplateKey: club.presentationTemplateKey,
      isBillingAuthorized,
      canMutateContent,
    }),
    [canMutateContent, club.presentationTemplateKey, club.role, isBillingAuthorized],
  );
  const navigation = useMemo(
    () => getVisibleAdminNavigation(accessContext),
    [accessContext],
  );
  const routes = useMemo(() => getVisibleAdminRoutes(accessContext), [accessContext]);
  const activeGroup = getAdminGroupForPathname(pathname, accessContext);
  const [openGroupKey, setOpenGroupKey] = useState(activeGroup);

  useEffect(() => {
    setOpenGroupKey(activeGroup);
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

  const handleSidebarOpenChange = useCallback(
    (open: boolean) => {
      if (open) setSidebarOpen(true);
      else closeSidebar(true);
    },
    [closeSidebar],
  );

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
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
    const active = isPathActive(pathname, route.href);
    return (
      <SidebarMenuItem key={route.href}>
        <SidebarMenuButton
          render={<Link href={route.href} />}
          onClick={() => closeSidebar(false)}
          isActive={active}
          className="h-10 gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
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
      className="admin-portal bg-background text-foreground"
      style={{ "--sidebar-width": "280px" } as React.CSSProperties}
    >
      <Sidebar id="admin-sidebar" className="border-r border-sidebar-border bg-sidebar">
        <SidebarHeader className="flex-row items-center gap-3 border-b border-sidebar-border px-5 py-5">
          {clubLogoUrl ? (
            <Image
              src={clubLogoUrl}
              alt={`${club.name} logo`}
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-lg border border-sidebar-border bg-white object-contain p-1"
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
            <p className="mt-0.5 text-xs text-sidebar-foreground/50">Club administration</p>
          </div>
          <button
            type="button"
            onClick={() => closeSidebar(true)}
            className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring lg:hidden"
            aria-label="Close admin navigation"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </SidebarHeader>

        <SidebarContent
          className="admin-nav-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y gap-1 px-3 py-4"
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
                    className="h-10 w-full gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
          className="border-t border-sidebar-border px-5 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-baseline gap-1.5 text-xs text-sidebar-foreground/45">
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
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur sm:gap-3 sm:px-6 lg:px-8">
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            aria-label="Open admin navigation"
            aria-controls="admin-sidebar"
            aria-expanded={sidebarOpen}
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <div className="hidden min-w-0 xl:block">
            <p className="truncate text-sm font-semibold text-foreground">
              {currentRoute?.label ?? "Admin"}
            </p>
          </div>
          <AdminRouteSearch routes={searchRoutes} />
          <AdminThemeToggle />
          <AdminAccountMenu email={userEmail} role={club.role} onSignOut={handleSignOut} />
        </header>

        <main className="min-w-0 flex-1 overflow-x-clip bg-muted/30 p-4 sm:p-6 lg:p-8">
          {club.kind === "customer" && club.publicAccess === "grace" ? (
            <div className="mx-auto mb-6 max-w-7xl rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
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
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
