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
  // sharp ships a native libvips binary that Next's file tracer mis-bundles on
  // Vercel's linux-x64 runtime (ERR_DLOPEN_FAILED: libvips-cpp.so). Keeping
  // sharp external lets Node resolve the correctly installed module at runtime.
  serverExternalPackages: ["sharp"],
  // serverExternalPackages alone isn't enough: confirmed locally that Next's
  // file tracer includes @img/sharp-<platform>-<arch> (the .node binding sharp
  // itself requires) but never @img/sharp-libvips-<platform>-<arch> -- the
  // package holding the actual libvips-cpp shared library that binding
  // dlopen()s at its own native-code load time, invisible to JS-level static
  // tracing. That's the exact file Vercel reports missing. Force it in.
  outputFileTracingIncludes: {
    "/api/admin/media/finalize": ["./node_modules/@img/sharp-libvips-*/**/*"],
    "/api/admin/media/cleanup": ["./node_modules/@img/sharp-libvips-*/**/*"],
    "/api/cron/media-cleanup": ["./node_modules/@img/sharp-libvips-*/**/*"],
  },
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
