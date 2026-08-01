const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;
const configuredOnzioMediaPattern = configuredSupabaseUrl
  ? {
      protocol: configuredSupabaseUrl.protocol.replace(":", ""),
      hostname: configuredSupabaseUrl.hostname,
      port: configuredSupabaseUrl.port,
      pathname: "/storage/v1/object/public/onzio-media/**",
    }
  : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  images: {
    // Onzio publishes normalized, immutable assets. Serve those source files
    // directly so an image-optimization quota or service outage cannot remove
    // photography from the site.
    unoptimized: true,
    // The legacy Rose City project's buckets were removed here when that
    // Supabase project was permanently deleted in the Phase 8 closeout — its
    // hostname no longer resolves, so the entries could only ever allow a
    // request that fails. The live project is supplied from the environment
    // above. See PF-005/PF-006 in docs/platform-findings.md.
    remotePatterns: [
      ...(configuredOnzioMediaPattern ? [configuredOnzioMediaPattern] : []),
    ],
    deviceSizes: [640, 828, 1080, 1440, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    qualities: [70, 80],
    minimumCacheTTL: 2678400,
  },
};

export default nextConfig;
