"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import Image from "@/components/ResilientImage";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { useClubContext } from "@/components/ClubContextProvider";
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

type AdminNavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  feature?: string;
  ownerOnly?: boolean;
};

const NAV_ITEMS: AdminNavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
        <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
        <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
        <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    label: "Homepage",
    href: "/admin/homepage",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 11l9-8 9 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 10v10h14V10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M9 20v-6h6v6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Programs",
    href: "/admin/programs",
    feature: "programs",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5 4h14v16H5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Contact",
    href: "/admin/contact",
    feature: "contact",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 5h16v14H4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Tryouts",
    href: "/admin/tryouts",
    feature: "tryouts",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M7 3v3M17 3v3M4 8h16v12H4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 12h3M13 12h3M8 16h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Seasons",
    href: "/admin/seasons",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="2"/>
        <path d="M8 2v4M16 2v4M3 9h18M8 13h3M13 13h3M8 17h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Roster",
    href: "/admin/roster",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.85" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Schedule",
    href: "/admin/schedule",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="22" height="22" rx="2" stroke="currentColor" strokeWidth="2"/>
        <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Match Stats",
    href: "/admin/stats",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Season Stats",
    href: "/admin/season-stats",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="2"/>
        <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Shop",
    href: "/admin/shop",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M6 8V6a6 6 0 0112 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M4 8h16l-1 13H5L4 8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "About",
    href: "/admin/about",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
        <path d="M12 10v7M12 7h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Sponsors",
    href: "/admin/sponsors",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.35 6.75 19.15l1-5.85L3.5 9.15l5.9-.85L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Standings",
    href: "/admin/standings",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 19h16M7 16V8M12 16V5M17 16v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M5 8h4M10 5h4M15 10h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Branding",
    href: "/admin/branding",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l7 3v5c0 4.6-2.9 8.3-7 10-4.1-1.7-7-5.4-7-10V6l7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <circle cx="12" cy="11" r="3" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M21 21H4.6C4.04 21 3.76 21 3.55 20.89a1 1 0 01-.44-.44C3 20.24 3 19.96 3 19.4V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M7 14l4-4 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Team access",
    href: "/admin/members",
    ownerOnly: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2"/>
        <path d="M3 20v-2a4 4 0 014-4h4a4 4 0 014 4v2M16 11h5M18.5 8.5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
        <path d="M2 10h20" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
  },
];

type AdminNavGroup = {
  key: string;
  label: string;
  icon: ReactNode;
  hrefs: string[];
};

type AdminNavEntry =
  | { type: "link"; href: string }
  | { type: "group"; group: AdminNavGroup };

const NAV_STRUCTURE: AdminNavEntry[] = [
  { type: "link", href: "/admin" },
  {
    type: "group",
    group: {
      key: "website",
      label: "Website",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
          <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        </svg>
      ),
      hrefs: ["/admin/homepage", "/admin/programs", "/admin/tryouts", "/admin/shop", "/admin/about", "/admin/sponsors", "/admin/contact"],
    },
  },
  {
    type: "group",
    group: {
      key: "competition",
      label: "Competition",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      hrefs: ["/admin/seasons", "/admin/roster", "/admin/schedule", "/admin/stats", "/admin/season-stats", "/admin/standings"],
    },
  },
  { type: "link", href: "/admin/analytics" },
  {
    type: "group",
    group: {
      key: "club-settings",
      label: "Club Settings",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H4a2 2 0 01-2-2 2 2 0 012-2h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33h.08a1.65 1.65 0 001-1.51V4a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51h.08a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.08a1.65 1.65 0 001.51 1H20a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      hrefs: ["/admin/branding", "/admin/members"],
    },
  },
  { type: "link", href: "/admin/payments" },
];

function groupKeyForPathname(pathname: string): string | null {
  for (const entry of NAV_STRUCTURE) {
    if (entry.type !== "group") continue;
    if (entry.group.hrefs.some((href) => pathname.startsWith(href))) {
      return entry.group.key;
    }
  }
  return null;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isBillingAdmin, setIsBillingAdmin] = useState(false);
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(() =>
    groupKeyForPathname(pathname),
  );

  useEffect(() => {
    setOpenGroupKey(groupKeyForPathname(pathname));
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    fetch("/api/stripe/billing-admin")
      .then((res) => res.json())
      .then((data) => setIsBillingAdmin(Boolean(data.isBillingAdmin)))
      .catch(() => setIsBillingAdmin(false));
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  const isEditorialTemplate = club.presentationTemplateKey === "editorial@1";
  const EDITORIAL_HIDDEN_HREFS = ["/admin/programs", "/admin/analytics", "/admin/stats", "/admin/season-stats"];

  const navItems = NAV_ITEMS.filter(
    (item) =>
      (!item.ownerOnly || club.role === "owner") &&
      (item.href !== "/admin/payments" || isBillingAdmin) &&
      (!isEditorialTemplate || !EDITORIAL_HIDDEN_HREFS.includes(item.href)),
  );

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const visibleNavItem = (href: string) =>
    navItems.find((item) => item.href === href);

  const toggleGroup = (key: string) =>
    setOpenGroupKey((previous) => (previous === key ? null : key));

  const renderNavLink = (
    item: AdminNavItem,
    options?: { closesGroups?: boolean },
  ) => (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        onClick={() => {
          setSidebarOpen(false);
          if (options?.closesGroups) setOpenGroupKey(null);
        }}
        isActive={isActive(item.href)}
        className="h-auto gap-4 px-4 py-3 font-display font-bold uppercase tracking-widest text-muted-foreground hover:bg-transparent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:bg-transparent data-[active=true]:font-bold data-[active=true]:text-foreground"
        style={{ fontSize: "1.15rem" }}
      >
        <span className={isActive(item.href) ? "text-brand" : "text-muted-foreground/60"}>
          {item.icon}
        </span>
        {item.label}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="dark bg-background"
      style={{ "--sidebar-width": "280px" } as React.CSSProperties}
    >
      {/* Sidebar */}
      <Sidebar id="admin-sidebar" className="border-r border-border bg-background">
        {/* Logo */}
        <SidebarHeader className="flex-row items-center gap-3 border-b border-border px-5 py-5">
          {clubLogoUrl ? (
            <Image
              src={clubLogoUrl}
              alt={club.name}
              width={36}
              height={36}
              className="rounded-full flex-shrink-0"
            />
          ) : (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border font-display text-xs font-black uppercase text-foreground">
              {club.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3)}
            </span>
          )}
          <div>
            <p className="font-display font-black uppercase text-foreground leading-none" style={{ fontSize: "0.8rem", letterSpacing: "0.1em" }}>
              {club.name}
            </p>
            <p className="font-display text-xs uppercase mt-0.5 text-muted-foreground" style={{ letterSpacing: "0.08em" }}>
              Admin
            </p>
          </div>
        </SidebarHeader>

        {/* Nav links */}
        <SidebarContent
          className="admin-nav-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y py-4 px-3 gap-1"
          style={{
            WebkitOverflowScrolling: "touch",
            scrollbarGutter: "stable",
          }}
          aria-label="Admin navigation"
          tabIndex={0}
        >
          {NAV_STRUCTURE.map((entry) => {
            if (entry.type === "link") {
              const item = visibleNavItem(entry.href);
              if (!item) return null;
              return (
                <SidebarMenu key={item.href} className="gap-1">
                  {renderNavLink(item, { closesGroups: true })}
                </SidebarMenu>
              );
            }

            const { group } = entry;
            const children = group.hrefs
              .map((href) => visibleNavItem(href))
              .filter((item): item is AdminNavItem => Boolean(item));
            if (children.length === 0) return null;

            const isOpen = openGroupKey === group.key;
            const panelId = `admin-nav-group-${group.key}`;
            const headerId = `${panelId}-header`;

            return (
              <SidebarGroup key={group.key} className="p-0">
                <SidebarGroupLabel
                  render={<button type="button" />}
                  id={headerId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleGroup(group.key)}
                  className="h-auto w-full gap-4 rounded-md px-4 py-3 font-display font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  style={{ fontSize: "1rem" }}
                >
                  <span className="text-muted-foreground/60">{group.icon}</span>
                  <span className="whitespace-nowrap text-left">{group.label}</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className={`ml-auto transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </SidebarGroupLabel>
                <SidebarGroupContent
                  id={panelId}
                  role="region"
                  aria-labelledby={headerId}
                  hidden={!isOpen}
                >
                  <SidebarMenu className="gap-1 pl-4">
                    {children.map((item) => renderNavLink(item))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>

        {/* User + sign out */}
        <SidebarFooter
          className="border-t border-border px-4 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {userEmail && (
            <p
              className="font-body mb-3 truncate text-sm text-muted-foreground/70"
              title={userEmail}
            >
              {userEmail}
            </p>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 font-display text-sm tracking-widest uppercase text-foreground transition-opacity duration-200 opacity-40 hover:opacity-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        </SidebarFooter>
      </Sidebar>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-4 border-b border-border bg-background px-5 py-4 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground"
            aria-label="Open admin navigation"
            aria-controls="admin-sidebar"
            aria-expanded={sidebarOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <p className="font-display font-black uppercase text-foreground text-sm tracking-widest">
            {club.name} Admin
          </p>
        </div>

        <main className="flex-1 overflow-auto p-6 lg:p-8">
          {club.kind === "customer" &&
            (club.publicAccess === "grace" || club.publicAccess === "suspended") && (
              <div className="mx-auto mb-6 max-w-7xl rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 font-body text-sm text-warning">
                Billing needs attention. Content changes are paused;{" "}
                <Link href="/admin/payments" className="font-bold underline">
                  review payment details
                </Link>
                .
              </div>
            )}
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
