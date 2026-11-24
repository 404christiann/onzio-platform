import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createLocalClients } from "../helpers/supabase";

/**
 * UI-FIX-MATCH-SUMMARY-SCORERS: on Rose City's public Match Summary the scorer line must sit below the whole home team
 * name, however many lines the name takes, and nothing in the score header may overlap or leave the page.
 * Runs against the shared local Supabase (Rose City, kind test); every row it adds is deleted afterwards and the club
 * identity it edits is put back.
 */
const CLUB_ID = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const WIDTHS = [375, 768, 1024, 1440, 2000] as const;
const id = (n: number) => `5c0e0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SHOTS = process.env.MATCH_SUMMARY_SHOT_DIR;

type Case = {
  key: string; home: string; opponent: string; short?: string | null; scorers: string[]; score: [number, number];
  competition?: string | null; venue?: string; logo?: string | null;
};
const LONG_NAME = "Valle de las Rosas Asociacion Deportiva Futbol Club Juvenil de la Ciudad";
const unbreakable = (n: number) => "W".repeat(n);
const goals = (n: number, name: (i: number) => string) => Array.from({ length: n }, (_, i) => name(i));

const CASES: Case[] = [
  { key: "reported", home: "Rose City Futbol Club", opponent: "AYSD D1", scorers: ["J. Hernandez (14′)"], score: [5, 3], competition: "UPSL 2026 Premier SoCal North", venue: "Lake Forest Sports Park" },
  { key: "short-name", home: "RCFC", opponent: "Ocelot FC", short: "OCFC", scorers: ["J. Hernandez (38′)", "G. Alfaro (73′)"], score: [1, 0], competition: "UPSL Premier Regular Season", venue: "Robinson Stadium" },
  { key: "long-home-three-lines", home: "Rose City Futbol Club of the San Gabriel Valley", opponent: "AYSD D1", scorers: ["J. Hernandez (14′)", "G. Alfaro (73′)"], score: [2, 1], competition: "UPSL", venue: "Lake Forest Sports Park" },
  { key: "long-both-names", home: LONG_NAME, opponent: LONG_NAME, scorers: ["J. Hernandez (14′)"], score: [3, 3], competition: "UPSL", venue: "Park" },
  { key: "unbreakable-names", home: unbreakable(28), opponent: unbreakable(40), scorers: ["J. Hernandez (14′)"], score: [1, 1], competition: "UPSL", venue: "Park" },
  { key: "one-letter-names", home: "R", opponent: "X", scorers: ["J. H. (1′)"], score: [1, 0], competition: "UPSL", venue: "Park" },
  { key: "many-scorers", home: "Rose City Futbol Club", opponent: "AYSD D1", score: [9, 0], competition: "UPSL", venue: "Park",
    scorers: ["J. Hernandez (4′)", "J. Hernandez (14′)", "J. Hernandez (88′)", "G. Alfaro Villanueva-Ruiz (21′)", "M. Ortiz (pen. 30′)", "A. Sánchez (OG 52′)", "C. De la Cruz (61′)", "Santiago Fernando Rodríguez-Montenegro (70′)", "L. Pérez (90+3′)"] },
  { key: "twenty-five-long-scorers", home: "Rose City Futbol Club", opponent: "AYSD D1", score: [25, 0], competition: "UPSL", venue: "Park",
    scorers: goals(25, i => `Santiago Fernando Rodríguez-Montenegro del Valle ${i + 1} (${i + 1}′)`) },
  { key: "unbreakable-scorer", home: "Rose City Futbol Club", opponent: "AYSD D1", score: [1, 0], competition: "UPSL", venue: "Park", scorers: [`${unbreakable(70)} (14′)`, "J. Hernandez (30′)"] },
  { key: "no-scorers-no-logo", home: "Rose City Futbol Club", opponent: "AYSD D1", score: [0, 0], competition: "UPSL", venue: "Park", scorers: [], logo: null },
  { key: "double-digit-scores", home: "Rose City Futbol Club", opponent: "AYSD D1", score: [99, 99], competition: "UPSL", venue: "Park", scorers: ["J. Hernandez (14′)"] },
  { key: "no-venue-no-competition", home: "Rose City Futbol Club", opponent: "AYSD D1", score: [2, 1], competition: null, venue: "", scorers: ["J. Hernandez (14′)"] },
  { key: "long-competition-venue", home: "Rose City Futbol Club", opponent: "AYSD D1", score: [2, 1], scorers: ["J. Hernandez (14′)"],
    competition: "United Premier Soccer League 2026 Premier Division SoCal North Conference Matchd", venue: "Lake Forest Sports Park and Recreation Center Main Stadium Field Number One at the Civic Center Complex" },
  { key: "non-latin-and-emoji", home: "ローズシティ フットボール クラブ", opponent: "Ατρόμητος ⚽️🔥 الأهلي", score: [2, 1], competition: "リーグ 🏆", venue: "Estadio 🏟️ Ñandú",
    scorers: ["山田 太郎 (14′)", "محمد صلاح (30′)", "🇲🇽 J. Hernández 🔥 (45+2′)"] },
];
const caseIndex = (key: string) => CASES.findIndex(item => item.key === key) + 1;

const { service } = createLocalClients();
let originalInitials: string | null = null;
/** Set when Rose City had no season, identity row or staging host, so what this run adds is removed again. */
let seasonCreated = false;
let identityCreated = false;
let domainCreated = false;
const CREST = "/match-summary-scorers-crest.webp";
const CREST_FILE = path.resolve("assets/rose-city-2027/inputs/crest.webp");

async function must<T extends { error: { message: string } | null }>(label: string, result: PromiseLike<T>) {
  const done = await result;
  if (done.error) throw new Error(`${label}: ${done.error.message}`);
  return done;
}

/**
 * Rose City must already be on the local database as the public site (club, a published
 * cinematic@2 presentation: scripts/seed-rose-city-2027-local.ts). Presentation documents are immutable, so this spec
 * does not create or remove them. It needs one season to hang matches on and adds one only when there is none.
 */
async function roseCitySeason(): Promise<string> {
  const club = await service.from("clubs").select("id").eq("id", CLUB_ID).maybeSingle();
  const published = await service.from("presentation_state").select("published_document_id").eq("club_id", CLUB_ID).maybeSingle();
  if (!club.data || !published.data?.published_document_id) throw new Error("Rose City is not on the local database as a published cinematic@2 site; run scripts/seed-rose-city-2027-local.ts first.");
  const host = await service.from("club_domains").select("id").eq("club_id", CLUB_ID).eq("hostname", "rose-city.localhost").eq("environment", "staging").maybeSingle();
  if (!host.data) {
    domainCreated = true;
    await must("domain", service.from("club_domains").insert({ club_id: CLUB_ID, hostname: "rose-city.localhost", environment: "staging", is_primary: true, active: true, verified_at: new Date().toISOString() }));
  }
  let season = await service.from("seasons").select("id").eq("club_id", CLUB_ID).limit(1).maybeSingle();
  if (!season.data) {
    seasonCreated = true;
    await must("season", service.from("seasons").insert({ club_id: CLUB_ID, label: "2026", start_year: 2026, end_year: 2026 }));
    season = await service.from("seasons").select("id").eq("club_id", CLUB_ID).limit(1).maybeSingle();
  }
  return season.data!.id as string;
}

test.beforeAll(async () => {
  const seasonId = await roseCitySeason();
  let identity = await service.from("club_identity").select("initials").eq("club_id", CLUB_ID).maybeSingle();
  if (!identity.data) {
    identityCreated = true;
    await must("identity", service.from("club_identity").insert({ club_id: CLUB_ID, short_name: "Rose City FC", initials: "RCFC", founded_year: 2013 }));
    identity = await service.from("club_identity").select("initials").eq("club_id", CLUB_ID).maybeSingle();
  }
  originalInitials = identity.data!.initials as string;
  await service.from("matches").delete().eq("club_id", CLUB_ID).in("id", CASES.map((_, i) => id(i + 1)));
  const rows = CASES.map((item, i) => ({
    id: id(i + 1), club_id: CLUB_ID, season_id: seasonId, date: "2026-05-31", time: "12:00:00", opponent: item.opponent,
    opponent_short_name: item.short ?? null, opponent_logo_url: item.logo === undefined ? "/rose-city/icons/youtube-logo.png" : item.logo,
    competition: item.competition ?? null, home: true, venue: item.venue ?? "", rose_city_score: item.score[0], opponent_score: item.score[1],
    scorers: item.scorers, league_game: true,
  }));
  await must("seeding matches", service.from("matches").insert(rows));
});

test.afterAll(async () => {
  await service.from("matches").delete().eq("club_id", CLUB_ID).in("id", CASES.map((_, i) => id(i + 1)));
  if (identityCreated) await service.from("club_identity").delete().eq("club_id", CLUB_ID);
  else if (originalInitials !== null) await service.from("club_identity").update({ initials: originalInitials }).eq("club_id", CLUB_ID);
  if (seasonCreated) await service.from("seasons").delete().eq("club_id", CLUB_ID);
  if (domainCreated) await service.from("club_domains").delete().eq("club_id", CLUB_ID).eq("hostname", "rose-city.localhost");
});

test.beforeEach(async ({ page }) => {
  await page.route(`**${CREST}`, route => route.fulfill({ path: CREST_FILE, contentType: "image/webp" }));
});

type Box = { x: number; y: number; right: number; bottom: number; w: number; h: number };
type Measure = Record<string, Box | null> & { _pageOverflow: number; _clipped: string[]; _nextTop: number | null; _wide: string[] };

/** Every box in the score header, in page pixels, plus whether any name or scorer text spills out of its own box. */
async function measure(page: Page): Promise<Measure> {
  return await page.evaluate(() => {
    const box = (element: Element | null | undefined): Box | null => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x + scrollX, y: r.y + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY, w: r.width, h: r.height };
    };
    const strip = document.querySelector(".summary-score .result-strip");
    const crests = strip ? Array.from(strip.querySelectorAll(".result-crest")) : [];
    const events = strip?.querySelector(".result-events") ?? null;
    const clipped: string[] = [];
    for (const [label, element] of [["home name", strip?.querySelector(".result-name.home")], ["away name", strip?.querySelector(".result-name.away")], ["scorers", events]] as const) {
      if (element && element.scrollWidth > element.clientWidth + 1) clipped.push(label);
    }
    const next = strip?.closest(".summary-score")?.nextElementSibling ?? null;
    const wide = Array.from(document.querySelectorAll("body *")).filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && getComputedStyle(el).overflowX === "visible" && el.getBoundingClientRect().left + el.scrollWidth > document.documentElement.clientWidth + 1)
      .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${Math.round(el.getBoundingClientRect().width)}px wrap=${getComputedStyle(el).overflowWrap} cols=${getComputedStyle(el.parentElement!).gridTemplateColumns}`).filter((v, i, all) => all.indexOf(v) === i).slice(0, 4);
    return {
      strip: box(strip), homeName: box(strip?.querySelector(".result-name.home")), homeCrest: box(crests[0]), score: box(strip?.querySelector(".result-score")),
      awayCrest: box(crests[1]), awayName: box(strip?.querySelector(".result-name.away")), events: box(events), scoreBlock: box(strip?.closest(".summary-score")),
      _pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, _clipped: clipped, _nextTop: next ? box(next)!.y : null, _wide: wide,
    } as unknown as Measure;
  });
}

const overlap = (a: Box, b: Box) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
const PARTS = ["homeName", "homeCrest", "score", "awayCrest", "awayName", "events"] as const;

/** What is wrong with one measurement, as readable lines (empty when the header is sound). */
function problems(m: Measure, hasScorers: boolean): string[] {
  const found: string[] = [];
  if (m._pageOverflow > 0) found.push(`page scrolls sideways by ${m._pageOverflow}px (wide: ${m._wide.join(", ") || "nothing found"})`);
  if (m._clipped.length) found.push(`text spills out of its box: ${m._clipped.join(", ")}`);
  for (const [i, a] of PARTS.entries()) for (const b of PARTS.slice(i + 1)) {
    const first = m[a], second = m[b];
    if (first && second && overlap(first, second)) found.push(`${a} overlaps ${b}`);
  }
  if (hasScorers) {
    if (!m.events || !m.homeName) found.push("scorer line or home name missing");
    else if (m.events.y < m.homeName.bottom - 0.5) found.push(`scorers start ${(m.homeName.bottom - m.events.y).toFixed(1)}px above the bottom of the home name`);
  }
  const strip = m.strip;
  if (strip) for (const part of PARTS) {
    const p = m[part];
    if (p && (p.bottom > strip.bottom + 0.5 || p.x < -0.5 || p.right > (strip.right + 0.5))) found.push(`${part} leaves the score header`);
  }
  if (m._nextTop !== null && m.strip && m.strip.bottom > m._nextTop + 0.5) found.push("score header runs into the next section");
  return found;
}

for (const item of CASES) {
  test(`score header holds: ${item.key}`, async ({ page }) => {
    const update = await service.from("club_identity").update({ initials: item.home }).eq("club_id", CLUB_ID);
    expect(update.error).toBeNull();
    const failures: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 800 ? 812 : 1000 });
      await page.goto(`/schedule/${id(caseIndex(item.key))}`);
      const strip = page.locator(".summary-score .result-strip");
      await expect(strip).toBeVisible({ timeout: 60_000 });
      await expect(page.locator(".result-name.home")).toHaveText(item.home);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const found = problems(await measure(page), item.scorers.length > 0);
      if (found.length) failures.push(`${width}px: ${found.join("; ")}`);
      if (SHOTS && ["reported", "many-scorers", "long-home-three-lines"].includes(item.key) && (width === 375 || width === 2000)) {
        mkdirSync(SHOTS, { recursive: true });
        await page.locator(".summary-score").screenshot({ path: path.join(SHOTS, `${item.key}-${width}.png`) });
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
