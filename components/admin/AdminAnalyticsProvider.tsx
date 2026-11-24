"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  adminTabForPath,
  identifyAdminSession,
  initAdminAnalytics,
  trackAdminEvent,
  type AdminAnalyticsEnv,
  type AdminSessionIdentity,
} from "@/lib/admin-analytics";

/** Renders nothing: it starts PostHog for the classic admin and reports tab views. */
export function AdminAnalyticsProvider({
  env,
  identity,
}: {
  env: AdminAnalyticsEnv;
  identity: AdminSessionIdentity;
}) {
  const pathname = usePathname();
  const { vercelEnv, key, host } = env;
  const { userId, clubId, clubSlug, role } = identity;

  useEffect(() => {
    if (initAdminAnalytics({ vercelEnv, key, host })) {
      identifyAdminSession({ userId, clubId, clubSlug, role });
    }
  }, [vercelEnv, key, host, userId, clubId, clubSlug, role]);

  useEffect(() => {
    trackAdminEvent("admin_tab_viewed", { tab: adminTabForPath(pathname) });
  }, [pathname, clubId]);

  return null;
}
