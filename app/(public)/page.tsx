"use client";

import HomePageClient from "@/components/HomePageClient";

export const dynamic = "force-dynamic";

// Legacy unscoped route. All public tenant traffic is rewritten by
// middleware.ts to app/%5Fclubs/[slug]/page.tsx, which resolves the hero
// content server-side; this path has no slug to resolve, so it passes null
// and Hero client-fetches from a tenant-neutral initial state.
export default function HomePage() {
  return <HomePageClient initialHeroContent={null} />;
}
