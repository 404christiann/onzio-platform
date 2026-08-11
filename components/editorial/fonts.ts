import localFont from "next/font/local";

/**
 * Geist, vendored locally (variable woff2 files from the `geist` npm
 * package, SIL Open Font License — see fonts/LICENSE.txt). Loaded through
 * next/font/local so no network fetch happens at build time.
 *
 * These font scopes are applied ONLY on the editorial template wrapper by
 * the tenant layout; classic-template tenants keep their existing
 * typography untouched. This module is imported only from the app layout
 * tree because next/font requires the Next.js compiler.
 */
export const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

export const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const editorialFontClassName = `${geistSans.variable} ${geistMono.variable}`;
