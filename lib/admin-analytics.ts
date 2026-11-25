import posthog from "posthog-js";

import { ADMIN_ROUTE_MANIFEST } from "@/lib/admin-route-manifest";

/**
 * The only module that imports posthog-js. Classic /admin only: the provider that
 * calls initAdminAnalytics is mounted in the protected admin layout, so on public
 * club sites (and anywhere before init) every export here is a silent no-op.
 */

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export type AdminAnalyticsEnv = {
  vercelEnv?: string;
  key?: string;
  host?: string;
};

export type AdminAnalyticsConfig = { key: string; host: string };

export type AdminSessionIdentity = {
  userId: string;
  clubId: string;
  clubSlug: string;
  role: "owner" | "admin";
};

export type AdminSaveFailureReason = "validation" | "conflict" | "network" | "server" | "unknown";

/** Props are short static labels (tab ids, editor names). Never ids, emails, names or URLs. */
type AdminEventProps = {
  admin_tab_viewed: { tab: string };
  admin_content_saved: { editor: string };
  admin_content_save_failed: { editor: string; reason: AdminSaveFailureReason };
  admin_visibility_toggled: { scope: string; visible: boolean };
  admin_media_uploaded: { slot: string; ok: boolean };
  admin_preview_clicked: { page: string };
  admin_checkout_started: Record<string, never>;
  admin_billing_portal_opened: Record<string, never>;
  admin_modal_opened: { modal: string };
};

export type AdminEvent = keyof AdminEventProps;

type ClubContextProps = { club_id: string; club_slug: string; role: AdminSessionIdentity["role"] };

const ROUTES_LONGEST_FIRST = [...ADMIN_ROUTE_MANIFEST].sort((a, b) => b.href.length - a.href.length);

/** The manifest id for a path, so a raw URL (with match ids and the like) never becomes a prop. */
export function adminTabForPath(pathname: string): string {
  const route = ROUTES_LONGEST_FIRST.find(({ href }) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`),
  );
  return route?.id ?? "other";
}

/** The static admin tab id for the page being viewed; "other" outside a browser. */
export function currentAdminTab(): string {
  return typeof window === "undefined" ? "other" : adminTabForPath(window.location.pathname);
}

/** Classic admin pages only: /admin and its children, never the login or auth callback pages. */
export function isClassicAdminPath(pathname: string): boolean {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return false;
  return !/^\/admin\/(login|auth)(\/|$)/.test(pathname);
}

// `initialized`: posthog.init has run (once per page load). `active`: the classic admin is mounted and
// capture is allowed. Leaving the admin (logout, an expired session, any soft navigation) clears it.
let initialized = false;
let active = false;
let clubContext: ClubContextProps | null = null;

/** Last line of defence: nothing (events, $pageleave, replay snapshots) is sent off a classic admin page. */
function onlyOnClassicAdmin<T>(event: T): T | null {
  return active && typeof window !== "undefined" && isClassicAdminPath(window.location.pathname) ? event : null;
}

export function resolveAdminAnalyticsConfig(env: AdminAnalyticsEnv): AdminAnalyticsConfig | null {
  const key = env.key?.trim();
  if (env.vercelEnv !== "production" || !key) return null;
  return { key, host: env.host?.trim() || DEFAULT_POSTHOG_HOST };
}

export function initAdminAnalytics(env: AdminAnalyticsEnv): boolean {
  if (active) return true;
  if (typeof window === "undefined") return false;
  const config = resolveAdminAnalyticsConfig(env);
  if (!config) return false;
  active = true;
  if (initialized) {
    posthog.startSessionRecording();
    return true;
  }
  posthog.init(config.key, {
    api_host: config.host,
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: {
      dom_event_allowlist: ["click"],
      element_attribute_ignorelist: ["value"],
    },
    session_recording: { maskAllInputs: true },
    before_send: onlyOnClassicAdmin,
  });
  initialized = true;
  return true;
}

/** Copies only the four opaque fields, so an email, name or billing field passed in by mistake never leaves. */
export function identifyAdminSession(identity: AdminSessionIdentity): void {
  if (!active) return;
  const { userId, clubId, clubSlug, role } = identity;
  clubContext = { club_id: clubId, club_slug: clubSlug, role };
  posthog.identify(userId, { ...clubContext });
  posthog.register({ ...clubContext });
}

/** Stops replay and capture when the classic admin unmounts; the next init resumes. */
export function pauseAdminAnalytics(): void {
  if (!active) return;
  active = false;
  posthog.stopSessionRecording();
}

/** Logout: stop capture first, then forget the identity. */
export function resetAdminAnalytics(): void {
  clubContext = null;
  if (!initialized) return;
  pauseAdminAnalytics();
  posthog.reset();
}

export function trackAdminEvent<E extends AdminEvent>(
  event: E,
  ...props: AdminEventProps[E] extends Record<string, never> ? [] : [AdminEventProps[E]]
): void {
  if (!active) return;
  posthog.capture(event, { ...props[0], ...clubContext });
}
