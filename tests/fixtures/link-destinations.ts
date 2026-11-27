import type { LinkKind } from "@/lib/link-destination";

/**
 * One table for the TypeScript normalizer and its SQL copy. Each case is
 * `[input, expected, allow?]`; `null` means rejected. The database parity test
 * runs every row through `onzio_private.normalize_link_destination` and
 * requires the same output.
 */
export type LinkDestinationCase = readonly [input: string, expected: string | null, allow?: readonly LinkKind[]];

/**
 * Golden values: every link saved in production, read live (read-only select)
 * on 2026-11-27 before this change: 37 values across Rose City and Diverse City,
 * with names, addresses and ids swapped for look-alikes of the same shape.
 * Existing value in, same value out.
 */
export const GOLDEN_SAVED_LINKS: readonly LinkDestinationCase[] = [
  ["https://www.youtube.com/@ClubFC/live", "https://www.youtube.com/@ClubFC/live"],
  ["https://docs.google.com/forms/d/1aB_cDeFgHiJkLmN-oPqRsTuVwXyZ0123456789AbCdE/viewform", "https://docs.google.com/forms/d/1aB_cDeFgHiJkLmN-oPqRsTuVwXyZ0123456789AbCdE/viewform"],
  ["https://forms.gle/aBcDeFgHiJkLmN0p1", "https://forms.gle/aBcDeFgHiJkLmN0p1"],
  ["/tickets", "/tickets"],
  ["/programs", "/programs"],
  ["/club/about", "/club/about"],
  ["/roster", "/roster"],
  ["/community/partnership", "/community/partnership"],
  ["/schedule", "/schedule"],
  ["/shop", "/shop"],
  ["https://www.store.example.com/products/club-fc-home-mens-dri-fit-soccer-jersey", "https://www.store.example.com/products/club-fc-home-mens-dri-fit-soccer-jersey"],
  ["mailto:club.fc@mail.com?subject=Club%20FC%20Jersey%20Order", "mailto:club.fc@mail.com?subject=Club%20FC%20Jersey%20Order"],
  ["https://www.facebook.com/search/top?q=club%20futbol%20club", "https://www.facebook.com/search/top?q=club%20futbol%20club", ["https"]],
  ["https://www.instagram.com/clubfutbolclub/", "https://www.instagram.com/clubfutbolclub/", ["https"]],
  ["https://www.tiktok.com/@clubfc", "https://www.tiktok.com/@clubfc", ["https"]],
  ["https://www.youtube.com/@ClubFC", "https://www.youtube.com/@ClubFC", ["https"]],
  ["https://x.com/ClubFutbol", "https://x.com/ClubFutbol", ["https"]],
  ["https://www.instagram.com/club_fc/?hl=en", "https://www.instagram.com/club_fc/?hl=en", ["https"]],
  ["https://www.facebook.com/p/Club-FC-100083085652794/", "https://www.facebook.com/p/Club-FC-100083085652794/", ["https"]],
  ["https://tally.so/r/AbC1dE", "https://tally.so/r/AbC1dE"],
  ["mailto:info@clubfutbolclub.com", "mailto:info@clubfutbolclub.com"],
  ["https://coffeeshop.com", "https://coffeeshop.com"],
  ["https://www.tacoshop.com", "https://www.tacoshop.com"],
  ["https://www.citytransit.org", "https://www.citytransit.org"],
  ["https://www.mutualinsurance.org", "https://www.mutualinsurance.org"],
  ["https://www.sportsstore.com", "https://www.sportsstore.com"],
  ["https://www.photoagency.com", "https://www.photoagency.com"],
];

/** The rules, case by case. */
export const LINK_DESTINATION_RULES: readonly LinkDestinationCase[] = [
  ["", ""],
  ["   ", ""],
  ["info@club.com", "mailto:info@club.com"],
  ["  info@club.com \n", "mailto:info@club.com"],
  ["MAILTO:Info@Club.com", "mailto:Info@Club.com"],
  ["mailto:info@club.com", "mailto:info@club.com"],
  ["mailto:mailto:info@club.com", null],
  ["mailto:info@club.com?subject=Jersey%20Order", "mailto:info@club.com?subject=Jersey%20Order"],
  ["info@club.com?subject=Hi&cc=b@club.com", "mailto:info@club.com?subject=Hi&cc=b@club.com"],
  ["mailto:", null],
  ["mailto:info@club", null],
  ["mailto:a@b@club.com", null],
  ["mailto:a@club.com#x", null],
  ["https://forms.gle/tAezhCRdXH1Z1bMR7", "https://forms.gle/tAezhCRdXH1Z1bMR7"],
  ["https://tickets.example.com:8443/match?id=1#seats", "https://tickets.example.com:8443/match?id=1#seats"],
  ["www.example.com", "https://www.example.com"],
  ["example.com/path", "https://example.com/path"],
  ["example.com:8443/x", "https://example.com:8443/x"],
  ["http://example.com/a?b=c", "https://example.com/a?b=c"],
  ["HTTP://example.com", "https://example.com"],
  ["HTTPS://Example.com/Path", "https://Example.com/Path"],
  ["https://localhost/x", null],
  ["https://app.localhost", null],
  ["https://127.0.0.1/x", null],
  ["https://intranet", null],
  ["https://wiki.club.internal/x", null],
  ["club.internal/x", null],
  ["HTTPS://Printer.LOCAL", null],
  ["info@club.internal", null],
  ["mailto:info@mail.local", null],
  ["https://user:pw@club.com", null],
  ["https://club.com:99999", null],
  ["https:club.com", null],
  ["/", "/"],
  ["/shop?variant=home#kit", "/shop?variant=home#kit"],
  ["//evil.com", null],
  ["/\\evil.com", null],
  ["javascript:alert(1)", null],
  ["JaVaScRiPt:alert(1)", null],
  ["   javascript:alert(1)", null],
  ["java\tscript:alert(1)", null],
  ["data:text/html,<script>alert(1)</script>", null],
  ["vbscript:msgbox(1)", null],
  ["tel:+15551234567", null],
  ["has space.com", null],
  ["/a b", null],
  ["club", null],
  ["instagram.com/club", "https://instagram.com/club", ["https"]],
  ["info@club.com", null, ["https"]],
  ["/contact", null, ["https"]],
  ["/schedule", "/schedule", ["path"]],
  ["//evil.com", null, ["path"]],
  ["https://club.com", null, ["path"]],
];
