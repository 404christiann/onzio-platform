import { describe, expect, it } from "vitest";
import {
  LINK_DESTINATION_ERROR,
  LINK_DESTINATION_HINT,
  PROFILE_LINK,
  PROFILE_LINK_HINT,
  SITE_PAGE_LINK,
  linkDestinationHint,
  linkDestinationSchema,
  normalizeLinkDestination,
  renderableLink,
} from "@/lib/link-destination";

import { GOLDEN_SAVED_LINKS, LINK_DESTINATION_RULES } from "@/tests/fixtures/link-destinations";

const n = (value: unknown) => normalizeLinkDestination(value);

describe("golden saved links", () => {
  it.each(GOLDEN_SAVED_LINKS.map(([input, expected, allow]) => ({ input, expected, allow })))("$input comes out unchanged", ({ input, expected, allow }) => {
    expect(normalizeLinkDestination(input, { allow })).toBe(expected);
    expect(expected).toBe(input);
  });
});

describe("shared rule table", () => {
  it.each(LINK_DESTINATION_RULES.map(([input, expected, allow]) => ({ input, expected, allow })))("$input → $expected", ({ input, expected, allow }) => {
    expect(normalizeLinkDestination(input, { allow })).toBe(expected);
  });
});

describe("normalizeLinkDestination", () => {
  it("turns a bare email into a mailto link", () => {
    expect(n("info@club.com")).toBe("mailto:info@club.com");
  });

  it("trims surrounding whitespace before anything else", () => {
    expect(n("  info@club.com \n")).toBe("mailto:info@club.com");
    expect(n("\t/tickets ")).toBe("/tickets");
    expect(n("   ")).toBe("");
  });

  it("keeps blank as blank", () => {
    expect(n("")).toBe("");
  });

  describe("mailto", () => {
    it("lowercases only the scheme", () => {
      expect(n("MAILTO:Info@Club.com")).toBe("mailto:Info@Club.com");
      expect(n("MailTo:info@club.com")).toBe("mailto:info@club.com");
    });

    it("never double-prefixes", () => {
      expect(n("mailto:info@club.com")).toBe("mailto:info@club.com");
      expect(n("mailto:mailto:info@club.com")).toBeNull();
      expect(n("MAILTO:mailto:info@club.com")).toBeNull();
    });

    it("allows a query such as ?subject=", () => {
      expect(n("mailto:info@club.com?subject=Jersey%20Order")).toBe("mailto:info@club.com?subject=Jersey%20Order");
      expect(n("info@club.com?subject=Hi&cc=b@club.com")).toBe("mailto:info@club.com?subject=Hi&cc=b@club.com");
    });

    it("requires one valid address", () => {
      for (const value of ["mailto:", "mailto:info", "mailto:info@club", "mailto:a@b@club.com", "info@club", "@club.com", "mailto:a@localhost", "a b@club.com", "mailto:a@club.com#x"]) {
        expect(n(value), value).toBeNull();
      }
    });
  });

  describe("web links", () => {
    it("keeps https links, including Google Forms", () => {
      for (const value of [
        "https://docs.google.com/forms/d/1qs_nBHqzLAISgW-B-f2i5Ep5leScHDTHODKf-Bbir0M/viewform",
        "https://forms.gle/tAezhCRdXH1Z1bMR7",
        "https://www.facebook.com/search/top?q=rose%20city%20futbol%20club",
        "https://www.youtube.com/@RoseCityFC/live",
        "https://tickets.example.com:8443/match?id=1#seats",
      ]) {
        expect(n(value), value).toBe(value);
      }
    });

    it("adds https:// to a bare domain or domain with a path", () => {
      expect(n("www.example.com")).toBe("https://www.example.com");
      expect(n("example.com/path")).toBe("https://example.com/path");
      expect(n("example.com:8443/x")).toBe("https://example.com:8443/x");
    });

    it("upgrades http:// to https://", () => {
      expect(n("http://example.com/a?b=c")).toBe("https://example.com/a?b=c");
      expect(n("HTTP://example.com")).toBe("https://example.com");
    });

    it("lowercases only the scheme", () => {
      expect(n("HTTPS://Example.com/Path")).toBe("https://Example.com/Path");
    });

    it("rejects hosts that are not public", () => {
      for (const value of ["https://localhost/x", "https://app.localhost", "https://127.0.0.1/x", "https://10.0.0.1", "https://intranet", "https://club.local", "localhost:3000"]) {
        expect(n(value), value).toBeNull();
      }
    });

    it("rejects credentials and malformed authorities", () => {
      for (const value of ["https://user:pw@club.com", "https://@club.com", "https://", "https:club.com", "https:///club.com", "https://club.com:99999", "https://-club.com"]) {
        expect(n(value), value).toBeNull();
      }
    });
  });

  describe("site paths", () => {
    it("keeps a page on the site", () => {
      for (const value of ["/", "/tickets", "/community/partnership", "/shop?variant=home#kit"]) {
        expect(n(value), value).toBe(value);
      }
    });

    it("rejects protocol-relative and backslash paths", () => {
      for (const value of ["//evil.com", "//evil.com/path", "/\\evil.com", "\\\\evil.com"]) {
        expect(n(value), value).toBeNull();
      }
    });
  });

  describe("rejects everything else", () => {
    it("rejects script and data schemes in any case and with leading spaces", () => {
      for (const value of [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "JAVASCRIPT:alert(1)",
        "  javascript:alert(1)",
        "\tJaVaScRiPt:alert(1)",
        "java\tscript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "DATA:text/html;base64,PHNjcmlwdD4=",
        "vbscript:msgbox(1)",
        "VBScript:msgbox(1)",
      ]) {
        expect(n(value), value).toBeNull();
      }
    });

    it("rejects values with spaces, tel: and other schemes", () => {
      for (const value of ["has space.com", "https://club.com/a b", "/a b", "tel:+15551234567", "ftp://club.com", "file:///etc/passwd", "sms:+1555", "club", "#top", "?q=1"]) {
        expect(n(value), value).toBeNull();
      }
    });

    it("rejects non-strings", () => {
      expect(n(null)).toBeNull();
      expect(n(undefined)).toBeNull();
      expect(n(42)).toBeNull();
    });
  });

  it("is idempotent", () => {
    for (const value of [
      "info@club.com",
      " MAILTO:Info@Club.com?subject=Hi ",
      "www.example.com",
      "example.com/path",
      "http://example.com",
      "HTTPS://Example.com/x",
      "/tickets",
      "",
    ]) {
      const once = n(value);
      expect(once, value).not.toBeNull();
      expect(n(once), value).toBe(once);
    }
  });

  describe("per-field options", () => {
    it("profile links accept https only", () => {
      expect(normalizeLinkDestination("instagram.com/club", PROFILE_LINK)).toBe("https://instagram.com/club");
      expect(normalizeLinkDestination("https://x.com/club", PROFILE_LINK)).toBe("https://x.com/club");
      expect(normalizeLinkDestination("info@club.com", PROFILE_LINK)).toBeNull();
      expect(normalizeLinkDestination("/contact", PROFILE_LINK)).toBeNull();
      expect(normalizeLinkDestination("", PROFILE_LINK)).toBe("");
    });

    it("site-page links accept a path only", () => {
      expect(normalizeLinkDestination("/schedule", SITE_PAGE_LINK)).toBe("/schedule");
      expect(normalizeLinkDestination("//evil.com", SITE_PAGE_LINK)).toBeNull();
      expect(normalizeLinkDestination("https://club.com", SITE_PAGE_LINK)).toBeNull();
      expect(normalizeLinkDestination("info@club.com", SITE_PAGE_LINK)).toBeNull();
    });
  });
});

describe("copy", () => {
  it("uses one hint everywhere, and a profile hint for social links", () => {
    expect(linkDestinationHint()).toBe(LINK_DESTINATION_HINT);
    expect(LINK_DESTINATION_HINT).toBe("A link (like a Google Form), a page on your site starting with /, or an email address.");
    expect(linkDestinationHint(PROFILE_LINK)).toBe(PROFILE_LINK_HINT);
    expect(PROFILE_LINK_HINT).toBe("A full link to your profile.");
  });
});

describe("linkDestinationSchema", () => {
  it("parses to the normalized value", () => {
    expect(linkDestinationSchema().parse(" info@club.com ")).toBe("mailto:info@club.com");
  });

  it("fails with the shared error", () => {
    const result = linkDestinationSchema().safeParse("javascript:alert(1)");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(LINK_DESTINATION_ERROR);
    expect(LINK_DESTINATION_ERROR).toBe("That doesn't look like a link or email.");
  });

  it("enforces the field's length after normalizing", () => {
    expect(linkDestinationSchema({ max: 20 }).safeParse("info@club.com").success).toBe(true);
    expect(linkDestinationSchema({ max: 20 }).safeParse(`https://club.com/${"a".repeat(20)}`).success).toBe(false);
  });
});

describe("renderableLink", () => {
  it("renders only normalized links", () => {
    expect(renderableLink("mailto:info@club.com")).toBe("mailto:info@club.com");
    expect(renderableLink("javascript:alert(1)")).toBe("");
    expect(renderableLink("//evil.com")).toBe("");
    expect(renderableLink(null)).toBe("");
  });
});
