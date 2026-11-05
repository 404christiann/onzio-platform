import { describe, expect, it } from "vitest";
import { NEWS_CATEGORIES, isNewsSlug, joinNewsParagraphs, newestNewsFirst, newsArticleContentSchema, newsSlug, splitNewsParagraphs, newsArticleDate, newsInstantToLocal, newsLocalToInstant } from "@/lib/cinematic-news";

const foothill = {
  category: "sponsor-partner",
  cardHeading: "Foothill Transit",
  title: "Foothill Transit becomes Official Front of Jersey Sponsor of RCFC",
  subtitle: "Official Front of Jersey Sponsor for the 2027 Season",
  coverAlt: "Six Rose City FC lockers, each with a black Foothill Transit home jersey",
  paragraphs: ["Rose City FC announce sponsorship with Foothill Transit.", "Foothill Transit will be presenting partner on select RCFC content."],
  actionLabel: "Partner with us",
  actionHref: "/community/partnership",
};
const valid = (patch: Record<string, unknown>) => newsArticleContentSchema.safeParse({ ...foothill, ...patch }).success;

describe("RC2027-NEWS content rules", () => {
  it("shows the article date in the club's time zone, as Sam writes it", () => {
    expect(newsArticleDate("2026-11-20T20:00:00Z", "America/Los_Angeles")).toBe("Friday, Nov 20, 2026 at 12:00 PM");
    expect(newsArticleDate("2026-11-21T07:59:00Z", "America/Los_Angeles")).toBe("Friday, Nov 20, 2026 at 11:59 PM");
  });

  it("turns the editor's club-local date and time into the stored instant and back, across daylight saving", () => {
    expect(newsLocalToInstant("2026-11-20T12:00", "America/Los_Angeles")).toBe("2026-11-20T20:00:00.000Z");
    expect(newsLocalToInstant("2027-07-04T19:45", "America/Los_Angeles")).toBe("2027-07-05T02:45:00.000Z");
    expect(newsInstantToLocal("2027-07-05T02:45:00.000Z", "America/Los_Angeles")).toBe("2027-07-04T19:45");
    expect(newsInstantToLocal("2026-11-20T20:00:00+00:00", "America/Los_Angeles")).toBe("2026-11-20T12:00");
    expect(newsLocalToInstant("2026-13-01T12:00", "America/Los_Angeles")).toBeNull();
    expect(newsLocalToInstant("", "America/Los_Angeles")).toBeNull();
  });

  it("has Sam's five categories, in his order and colours, with the Community band label from his file", () => {
    expect(NEWS_CATEGORIES.map(item => [item.key, item.label, item.band, item.color])).toEqual([
      ["sponsor-partner", "Sponsor/Partner", "Sponsor/Partner", "#fc1618"],
      ["partner", "Partner", "Partner", "#5361ff"],
      ["community", "Community", "RCFC in the Community", "#ffa924"],
      ["new-player", "New Player", "New Player", "#00adc6"],
      ["news", "News", "News", "#3ba84b"],
    ]);
  });

  it("accepts the Foothill article and rejects unknown categories, missing text and extra fields", () => {
    expect(valid({})).toBe(true);
    expect(valid({ category: "transfers" })).toBe(false);
    expect(valid({ title: "  " })).toBe(false);
    expect(valid({ cardHeading: "" })).toBe(false);
    expect(valid({ paragraphs: [] })).toBe(false);
    expect(valid({ paragraphs: ["Fine", "   "] })).toBe(false);
    expect(valid({ subtitle: "" })).toBe(true);
    expect(valid({ coverAlt: "" })).toBe(true);
    expect(valid({ secret: "x" })).toBe(false);
    expect(valid({ title: "x".repeat(141) })).toBe(false);
    expect(valid({ cardHeading: "x".repeat(41) })).toBe(false);
    expect(valid({ paragraphs: Array.from({ length: 41 }, () => "Paragraph") })).toBe(false);
    expect(valid({ paragraphs: ["x".repeat(4001)] })).toBe(false);
  });

  it("allows a button only with both a label and a safe link: https or a page on this site", () => {
    expect(valid({ actionLabel: "", actionHref: "" })).toBe(true);
    expect(valid({ actionHref: "https://foothilltransit.org/routes" })).toBe(true);
    expect(valid({ actionLabel: "" })).toBe(false);
    expect(valid({ actionHref: "" })).toBe(false);
    for (const href of ["javascript:alert(1)", "//other.example", "http://example.com", "https://user:pass@example.com", "https://localhost/x", "/news\nbreak", " /tickets", "mailto:office@example.com"]) {
      expect(valid({ actionHref: href }), href).toBe(false);
    }
  });

  it("makes a stable web address from the title", () => {
    expect(newsSlug("Foothill Transit becomes Official Front of Jersey Sponsor of RCFC")).toBe("foothill-transit-becomes-official-front-of-jersey-sponsor-of-rcfc");
    expect(newsSlug("RCFC Welcomes Nick Méndez!")).toBe("rcfc-welcomes-nick-mendez");
    expect(newsSlug("¡¡!!")).toBe("article");
    const long = newsSlug("A very long headline that keeps going well past the eighty character limit for web addresses on this site");
    expect(long).toBe("a-very-long-headline-that-keeps-going-well-past-the-eighty-character-limit-for");
    expect(isNewsSlug(long)).toBe(true);
    for (const slug of ["", "Foothill", "-lead", "trail-", "double--dash", "injury-report", "x".repeat(81)]) expect(isNewsSlug(slug), slug).toBe(false);
  });

  it("treats each line of the editor's article text as a paragraph", () => {
    expect(splitNewsParagraphs("First paragraph.\n\nSecond one.  \nThird.\r\n\n\n")).toEqual(["First paragraph.", "Second one.", "Third."]);
    expect(splitNewsParagraphs("  \n ")).toEqual([]);
    expect(joinNewsParagraphs(["A.", "B."])).toBe("A.\n\nB.");
  });

  it("lists articles newest first", () => {
    const list = [
      { id: "b", publishedAt: "2026-11-20T20:00:00Z" },
      { id: "c", publishedAt: "2027-01-05T18:00:00Z" },
      { id: "a", publishedAt: "2026-11-20T20:00:00Z" },
    ];
    expect(newestNewsFirst(list).map(item => item.id)).toEqual(["c", "a", "b"]);
  });
});
