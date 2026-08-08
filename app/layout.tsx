import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Montserrat, Inter, DM_Sans } from "next/font/google";
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
// tenant (Diverse City FC) silently rendered in Geist instead. These are
// loaded globally (self-hosted by next/font, no runtime network fetch) but
// only take effect where `styles/globals.css` scopes them under
// `[data-font-pack="academy"]` -- see `components/TemplateFontScope.tsx`.
// Every other template's rendering is unaffected.
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
      className={`${geistSans.variable} ${geistMono.variable} ${academyHeading.variable} ${academyBody.variable} ${academyNav.variable}`}
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
