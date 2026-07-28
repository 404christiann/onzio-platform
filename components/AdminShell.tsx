"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import Image from "@/components/ResilientImage";
import { useClubBranding } from "@/components/ClubBrandingProvider";

const NAV_ITEMS = [
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

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { clubLogoUrl } = useClubBranding();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isBillingAdmin, setIsBillingAdmin] = useState(false);

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

  const navItems = NAV_ITEMS.filter((item) => item.href !== "/admin/payments" || isBillingAdmin);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#0e0e0e" }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-30 flex h-screen h-[100dvh] max-h-screen max-h-[100dvh] flex-col lg:static lg:flex lg:min-h-screen lg:h-auto lg:max-h-none lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{
          width: 280,
          backgroundColor: "#141414",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          transition: "transform 0.3s ease",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Image
            src={clubLogoUrl}
            alt="Rose City FC"
            width={36}
            height={36}
            className="rounded-full flex-shrink-0"
          />
          <div>
            <p className="font-display font-black uppercase text-white leading-none" style={{ fontSize: "0.8rem", letterSpacing: "0.1em" }}>
              Rose City
            </p>
            <p className="font-display text-xs uppercase mt-0.5" style={{ color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
              Admin
            </p>
          </div>
        </div>

        {/* Nav links */}
        <nav
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 px-3 flex flex-col gap-1"
          style={{ WebkitOverflowScrolling: "touch" }}
          aria-label="Admin navigation"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-150 font-display font-bold uppercase tracking-widest"
              style={{
                fontSize: "1.15rem",
                color: isActive(item.href) ? "#fff" : "rgba(255,255,255,0.35)",
                backgroundColor: isActive(item.href) ? "rgba(220,38,38,0.15)" : "transparent",
                borderLeft: isActive(item.href) ? "2px solid #dc2626" : "2px solid transparent",
              }}
            >
              <span style={{ color: isActive(item.href) ? "#dc2626" : "rgba(255,255,255,0.25)" }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User + sign out */}
        <div
          className="px-4 py-4 flex-shrink-0"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          {userEmail && (
            <p
              className="font-body mb-3 truncate"
              style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.25)" }}
              title={userEmail}
            >
              {userEmail}
            </p>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 font-display tracking-widest uppercase transition-opacity duration-200 opacity-40 hover:opacity-100"
            style={{ fontSize: "0.95rem", color: "white" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div
          className="lg:hidden flex items-center gap-4 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", backgroundColor: "#141414" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ color: "rgba(255,255,255,0.6)" }}
            aria-label="Open admin navigation"
            aria-controls="admin-sidebar"
            aria-expanded={sidebarOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <p className="font-display font-black uppercase text-white text-sm tracking-widest">
            Rose City Admin
          </p>
        </div>

        <main className="flex-1 overflow-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
