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
