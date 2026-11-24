import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { SITE_INDEXABLE_HEADER } from "@/lib/robots";

// Middleware (lib/robots.ts) decides per request and forwards the result; this
// route only renders it. A missing or unexpected value fails closed.
export default async function robotsTxt(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  if (requestHeaders.get(SITE_INDEXABLE_HEADER) !== "1" || !host) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/_clubs/", "/%5Fclubs/", "/register/", "/r/", "/club-logo"],
    },
    sitemap: `https://${host}/sitemap.xml`,
  };
}
