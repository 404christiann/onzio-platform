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
    remotePatterns: [
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/Aboutassets/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/about-page/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/flags/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/homepage/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/logos_v2/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/opponent-logos/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/roster/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/shop/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/sponsors/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/standings/**" },
      { protocol: "https", hostname: "nsgtkwqkbyxkiwrhzsje.supabase.co", pathname: "/storage/v1/object/public/onzio-media/**" },
      ...(configuredOnzioMediaPattern ? [configuredOnzioMediaPattern] : []),
    ],
    deviceSizes: [640, 828, 1080, 1440, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    qualities: [70, 80],
    minimumCacheTTL: 2678400,
  },
};

export default nextConfig;
