import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Rose City FC — Pasadena's Club",
  description:
    "Rose City Futbol Club — 2024 UPSL Champions. Semi-professional soccer based in Pasadena, CA.",
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
    <html lang="en">
      <body>
        <ClubBrandingProvider>{children}</ClubBrandingProvider>
        <Script defer src="/_vercel/insights/script.js" />
      </body>
    </html>
  );
}
