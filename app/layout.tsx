import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Montserrat,
  Inter,
  DM_Sans,
  Sora,
} from "next/font/google";
import Script from "next/script";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import "flag-icons/css/flag-icons.min.css";
import "@/styles/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// DCFC-D110's "montserrat-inter-dmsans" font pack was registered for
// `academy@1` at the presentation-document/schema layer only -- nothing ever
// loaded these fonts or applied them to rendered output, so every academy@1
// tenant (Diverse City FC) silently rendered in Geist instead. These variables
// are loaded globally (self-hosted by next/font, no runtime network fetch);
// academy@1 consumes them under `[data-font-pack="academy"]`. Editorial@1
// intentionally stays on the mockup's Geist Sans / Geist Mono pairing.
const academyHeading = Montserrat({
  variable: "--font-academy-heading",
  subsets: ["latin"],
});

const academyBody = Inter({
  variable: "--font-academy-body",
  subsets: ["latin"],
});

const academyNav = DM_Sans({
  variable: "--font-academy-nav",
  subsets: ["latin"],
});

// pathway@1 uses Sora only for public navigation links. The crest lockup,
// federation marks, CTA, and page typography retain their existing families.
const pathwayNav = Sora({
  variable: "--font-pathway-nav",
  subsets: ["latin"],
  weight: "500",
});

// crest@1's registered font pack was "playfair-inter" (Playfair Display +
// Inter, loaded here as crestDisplay/crestBody) until the 2026-08-18 visual
// refresh moved it onto the shared "geist" pack instead -- matching
// pathway@1's real bold-grotesk headline register (see
// packages/presentation/index.ts and styles/globals.css's `.crest-home`
// block for the full rationale). geistSans/geistMono above already cover
// it; crest@1 needs no dedicated font loading or `[data-font-pack]`
// override any more (compare the academy@1 fonts above, which still do).

export const metadata: Metadata = {
  title: "Onzio Platform",
  description:
    "Onzio-powered club websites, content management, and public soccer experiences.",
  icons: {
    icon: "/club-logo",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${academyHeading.variable} ${academyBody.variable} ${academyNav.variable} ${pathwayNav.variable}`}
    >
      <body>
        <ClubBrandingProvider>{children}</ClubBrandingProvider>
        {process.env.NODE_ENV === "production" && (
          <Script defer src="/_vercel/insights/script.js" />
        )}
      </body>
    </html>
  );
}
