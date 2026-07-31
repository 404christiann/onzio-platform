import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ClubBrandingProvider>{children}</ClubBrandingProvider>
        {process.env.NODE_ENV === "production" && (
          <Script defer src="/_vercel/insights/script.js" />
        )}
      </body>
    </html>
  );
}
