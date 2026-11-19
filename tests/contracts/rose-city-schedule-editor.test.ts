import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { rebaseForm, saveMatches, type MatchesApi, type SavedMatchRow } from "@/components/admin/schedule/rose-city/rose-city-schedule-save";
import { emptyForm, matchTooLong, normalizeScore, MAX_MATCH_SCORE, type FormState, type Match } from "@/components/admin/schedule/schedule-model";
import {
  MATCH_SECTIONS, buildMatchWrite, changedKeys, fixtureFromForm, formFromMatch, isNewKey, matchRowAfterSave, summaryLine, validateMatchForm,
} from "@/components/admin/schedule/rose-city/rose-city-schedule-model";
import { EMPTY_MATCH_SUMMARY, matchSummaryColumns, readMatchSummary, type MatchSummary } from "@/lib/match-summary";
import { matchReplayEmbedUrl } from "@/lib/youtube-embed";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("app/admin/(protected)/schedule/page.tsx");
const editor = read("components/admin/schedule/rose-city/RoseCityScheduleEditor.tsx");
const fields = read("components/admin/schedule/rose-city/RoseCityMatchFields.tsx");
const save = read("components/admin/schedule/rose-city/rose-city-schedule-save.ts");

/* ── A transcription of what the classic page does today for a cinematic@2 club, kept as the reference ── */
function oldSummaryColumnsFor(form: FormState) {
  const { summary, attendance, ...rest } = form;
  return { ...rest, attendance, ...matchSummaryColumns(summary) };
}
function oldWrite(form: FormState) {
  return {
    ...oldSummaryColumnsFor(form),
    address: form.address?.trim() || null,
    city: form.city?.trim() || null,
    state: form.state?.trim() || null,
    rose_city_score: normalizeScore(form.rose_city_score),
    opponent_score: normalizeScore(form.opponent_score),
    opponent_short_name: form.opponent_short_name?.trim() || null,
    competition: form.competition?.trim() || null,
    sponsor_name: form.sponsor_name?.trim() || null,
    sponsor_logo_url: form.sponsor_logo_url?.trim() || null,
    sponsor_link: form.sponsor_link?.trim() || null,
    replay_video_url: matchReplayEmbedUrl(form.replay_video_url ?? "") || null,
  };
}
function oldValidate(form: FormState): string | null {
  if (!form.season_id) return "Season is required.";
  if (!form.date)     return "Date is required.";
  if (!form.time)     return "Time is required.";
  if (!form.opponent.trim()) return "Opponent is required.";
  if (!form.venue.trim())    return "Venue is required.";
  const tooLong = matchTooLong(form);
  if (tooLong) return tooLong;
  if ([form.rose_city_score, form.opponent_score].some((score) => score !== null && score > MAX_MATCH_SCORE)) {
    return `Scores can be at most ${MAX_MATCH_SCORE}.`;
  }
  const roseCityScore = form.rose_city_score;
  const opponentScore = form.opponent_score;
  if ((roseCityScore !== null) !== (opponentScore !== null)) return "Enter both scores, or leave both blank.";
  if (
    (roseCityScore !== null && (!Number.isInteger(roseCityScore) || roseCityScore < 0)) ||
    (opponentScore !== null && (!Number.isInteger(opponentScore) || opponentScore < 0))
  ) return "Scores must be whole numbers of 0 or higher.";
  if (form.sponsor_logo_url && !form.sponsor_name?.trim()) return "Sponsor name is required when a sponsor logo is uploaded.";
  if (form.sponsor_link?.trim()) {
    try { const url = new URL(form.sponsor_link); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
    catch { return "Sponsor website link must be a valid http or https address."; }
  }
  if (matchReplayEmbedUrl(form.replay_video_url ?? "") === null) return "The stream or replay video must be a YouTube video link, like https://youtu.be/…";
  if (form.attendance !== null && (!Number.isInteger(form.attendance) || form.attendance < 0)) return "Attendance must be a whole number of 0 or higher.";
  return null;
}
function oldStartEdit(m: Match): FormState {
  return {
    date: m.date, time: m.time, opponent: m.opponent,
    opponent_short_name: m.opponent_short_name,
    opponent_logo_url: m.opponent_logo_url, competition: m.competition ?? "",
    league_logo_url: m.league_logo_url ?? null,
    sponsor_name: m.sponsor_name, sponsor_logo_url: m.sponsor_logo_url,
    sponsor_link: m.sponsor_link,
    home: m.home, venue: m.venue, address: m.address ?? "",
    city: m.city ?? "", state: m.state ?? "",
    rose_city_score: m.rose_city_score, opponent_score: m.opponent_score,
    replay_video_url: m.replay_video_url ?? null,
    attendance: m.attendance ?? null,
    summary: readMatchSummary(m.summary) ?? structuredClone(EMPTY_MATCH_SUMMARY),
    season_id: m.season_id,
  };
}

const summaryWithGoals: MatchSummary = {
  ...structuredClone(EMPTY_MATCH_SUMMARY),
  events: [
    { minute: " 12′ ", side: "club", kind: "goal", player: " #9 A. Apodaca ", detail: "" },
    { minute: "45′", side: "opponent", kind: "yellow", player: "#4 R. Diaz", detail: " " },
    { minute: "", side: "club", kind: "red", player: "", detail: "" },
  ],
  stats: [{ label: " Shots ", club: 14, opponent: 9.5 }, { label: "", club: 0, opponent: 0 }],
  officials: [{ role: "Referee", name: " M. Torres " }, { role: "VAR", name: "" }],
  kit: [{ item: "Jersey", color: "Black" }, { item: "Socks", color: "" }],
  lineups: { club: { starting: [{ number: "1", name: " M. Ruiz " }], bench: [], staff: [{ name: "G. Morales", role: "Head Coach" }] }, opponent: { starting: [], bench: [], staff: [] } },
};
const savedMatch: Match = {
  id: "m1", date: "2027-03-13", time: "18:00:00", opponent: "San Gabriel Valley FC", opponent_short_name: "SGV", opponent_logo_url: "https://x.test/o.png",
  competition: "UPSL Premier Division", league_logo_url: "https://x.test/l.png", sponsor_name: "Tepito Coffee", sponsor_logo_url: "https://x.test/s.png", sponsor_link: "https://tepito.example",
  home: true, venue: "Robinson Stadium", address: "1570 E Colorado Blvd, Pasadena, CA 91106", city: "Pasadena", state: "CA", rose_city_score: 2, opponent_score: 1,
  replay_video_url: "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0", attendance: 1356, summary: summaryWithGoals, season_id: "s27",
};
const forms: FormState[] = [
  emptyForm("s27"),
  { ...emptyForm("s27"), date: "2027-04-03", time: "18:00", opponent: "  Long Beach Fire ", venue: "Fire Field", address: "  ", city: " ", state: " ", competition: "  ", opponent_short_name: " ", sponsor_name: " ", sponsor_link: " " },
  { ...emptyForm("s27"), date: "2027-04-10", time: "19:30", opponent: "Away FC", home: false, venue: "Their Park", rose_city_score: 0, opponent_score: 0, attendance: 0, replay_video_url: "https://youtu.be/dQw4w9WgXcQ" },
  { ...formFromMatch(savedMatch), summary: summaryWithGoals },
  { ...formFromMatch(savedMatch), summary: { ...summaryWithGoals, events: summaryWithGoals.events.filter(event => event.kind !== "goal") } },
  { ...formFromMatch(savedMatch), summary: structuredClone(EMPTY_MATCH_SUMMARY), attendance: null, replay_video_url: "" },
  { ...formFromMatch(savedMatch), rose_city_score: null, opponent_score: null, sponsor_logo_url: null, league_logo_url: null, opponent_logo_url: null },
];

describe("Rose City Schedule editor: same edits, same saves", () => {
  it("builds a byte-identical write for every form", () => {
    for (const form of forms) expect(JSON.stringify(buildMatchWrite(form))).toBe(JSON.stringify(oldWrite(form)));
  });
  it("opens a saved match with the form the classic editor opens", () => {
    expect(JSON.stringify(formFromMatch(savedMatch))).toBe(JSON.stringify(oldStartEdit(savedMatch)));
    const sparse = { ...savedMatch, competition: null, league_logo_url: null, address: null, city: null, state: null, replay_video_url: null, attendance: null, summary: "not a summary" } as unknown as Match;
    expect(JSON.stringify(formFromMatch(sparse))).toBe(JSON.stringify(oldStartEdit(sparse)));
  });
  it("gives the classic error for every case, and none for a good match", () => {
    const base = { ...emptyForm("s27"), date: "2027-04-03", time: "18:00", opponent: "Fire", venue: "Field" };
    const cases: FormState[] = [
      ...forms,
      { ...base, season_id: "" }, { ...base, date: "" }, { ...base, time: "" }, { ...base, opponent: "  " }, { ...base, venue: "" },
      { ...base, opponent: "x".repeat(MATCH_TEXT_LIMITS.opponent + 1) }, { ...base, opponent_short_name: "x".repeat(21) }, { ...base, venue: "x".repeat(121) },
      { ...base, competition: "x".repeat(81) }, { ...base, address: "x".repeat(121) },
      { ...base, rose_city_score: 100, opponent_score: 0 }, { ...base, rose_city_score: 1, opponent_score: null }, { ...base, rose_city_score: 1.5, opponent_score: 0 }, { ...base, rose_city_score: -1, opponent_score: 0 },
      { ...base, sponsor_logo_url: "https://x.test/s.png", sponsor_name: " " }, { ...base, sponsor_link: "ftp://x.test" }, { ...base, sponsor_link: "nope" }, { ...base, sponsor_link: "https://ok.test" },
      { ...base, replay_video_url: "https://vimeo.com/1" }, { ...base, replay_video_url: "http://youtu.be/dQw4w9WgXcQ" }, { ...base, attendance: -3 }, { ...base, attendance: 2.5 }, { ...base, attendance: 5 },
    ];
    for (const form of cases) expect(validateMatchForm(form)).toBe(oldValidate(form));
    expect(validateMatchForm(base)).toBeNull();
    expect(validateMatchForm({ ...base, rose_city_score: 99, opponent_score: 99 })).toBeNull();
  });
  it("an untouched load then save sends nothing", () => {
    const baselines = { m1: formFromMatch(savedMatch) };
    expect(changedKeys(["m1"], { m1: structuredClone(baselines.m1) }, baselines)).toEqual([]);
    expect(changedKeys(["m1"], {}, baselines)).toEqual([]);
    const edited = { m1: { ...structuredClone(baselines.m1), venue: "Elsewhere" } };
    expect(changedKeys(["m1", "m2"], edited, { ...baselines, m2: emptyForm("s27") })).toEqual(["m1"]);
  });
  it("a saved write reads back as the same form", () => {
    const saved = { ...savedMatch, summary: matchSummaryColumns(summaryWithGoals).summary };
    const form = formFromMatch(saved);
    const row = matchRowAfterSave("m1", form);
    expect(changedKeys(["m1"], { m1: form }, { m1: formFromMatch(row) })).toEqual([]);
  });
  it("previews the same fixture the public Schedule builds from the saved row", () => {
    const fixture = fixtureFromForm("m1", formFromMatch(savedMatch));
    expect(fixture).toMatchObject({
      id: "m1", opponent: "San Gabriel Valley FC", opponentShortName: "SGV", leagueLogoUrl: "https://x.test/l.png", sponsorLogoUrl: "https://x.test/s.png",
      address: "1570 E Colorado Blvd, Pasadena, CA 91106", roseCityScore: 2, opponentScore: 1, replayVideoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0", scorers: ["A. Apodaca (12′)"],
    });
    expect(fixtureFromForm("n", { ...emptyForm("s27"), address: "  " }).address).toBeUndefined();
    expect(summaryLine(formFromMatch(savedMatch))).toBe("3 events · 2 stats");
    expect(summaryLine(emptyForm("s27"))).toBeNull();
  });
  it("has the four dialog sections and new-match keys", () => {
    expect(MATCH_SECTIONS.map(section => section.id)).toEqual(["match", "result", "summary", "sponsor"]);
    expect(isNewKey("new:1")).toBe(true);
    expect(isNewKey("0d6b1c1e-1111-4111-8111-111111111111")).toBe(false);
  });
});

describe("Rose City Schedule editor: scope", () => {
  it("branches only cinematic@2 in the classic portal, with one template read", () => {
    const main = page.slice(page.indexOf("export default function SchedulePage()"), page.indexOf("function ClassicSchedulePage()"));
    expect(main).toContain('if (portal.portal === "reimagined") return <LegacySchedulePage />;');
    expect(main).toContain('return isCinematic ? <RoseCityScheduleEditor /> : <ClassicSchedulePage />;');
    expect(page.match(/presentationTemplateKey/g)).toHaveLength(1);
    expect(page.match(/"cinematic@2"/g)).toHaveLength(1);
  });
  it("saves only through the match calls the classic page makes, and never adds an RPC", () => {
    expect(editor).not.toContain(".rpc(");
    expect(editor).not.toContain("fetch(");
    expect(editor).toContain('.update(write).eq("id", id)');
    expect(editor).toContain('.insert([write])');
    expect(save).toContain("api.update(key, buildMatchWrite(form))");
    expect(save).toContain("api.insert(buildMatchWrite(form))");
    expect(editor).toContain('.update({ rose_city_score: home, opponent_score: away }).eq("id", key)');
    expect(editor).toContain('.delete().eq("id", key)');
    expect(editor).not.toMatch(/postpone|cancelled/i);
  });
  it("keeps the schema limits on the fields", () => {
    for (const field of ["competition", "opponent", "opponent_short_name", "venue", "address", "city", "state"]) {
      expect(fields).toContain(`maxLength={MATCH_TEXT_LIMITS.${field}}`);
    }
    expect(fields).toContain("max={MAX_MATCH_SCORE}");
    expect(fields).toContain("<MatchSummaryFields");
    expect(fields).toContain('label="Stream or replay video (YouTube link)"');
    expect(fields).toContain("<SponsorLogoUpload");
  });
  it("darkens the league logo's \"No logo\" text for this dialog only, leaving the shared component alone", () => {
    expect(read("components/admin/schedule/rose-city/RoseCityScheduleEditor.module.css")).toContain(".leagueLogo :global(.text-black\\/50) { color: #595959; }");
    expect(fields).toContain("<div className={styles.leagueLogo}>");
    expect(read("components/admin/schedule/LeagueLogoUpload.tsx")).toContain("text-black/50");
  });
  it("uses the page frame, one Save and the shared discard words", () => {
    expect(editor).toContain("<PageFrame");
    expect(editor).toContain('breadcrumb={CRUMBS}');
    expect(editor).toContain('openPageHref="/schedule"');
    expect(editor).toContain("DISCARD_CONFIRM");
    expect(editor).toContain("useUnsavedGuard(");
    expect(editor).toContain("ShimmerRegion");
  });
});


describe("Rose City Schedule editor: conflict and retry", () => {
  const loaded = formFromMatch(savedMatch);
  const row = (changes: Partial<SavedMatchRow> = {}): SavedMatchRow => ({ ...savedMatch, updated_at: "t1", ...changes });
  const fakeApi = (rows: SavedMatchRow[], overrides: Partial<MatchesApi> = {}) => {
    const api = {
      readAll: vi.fn(async () => ({ rows })),
      update: vi.fn(async () => ({})),
      insert: vi.fn(async () => ({ id: "new-id" })),
      cleanup: vi.fn(async () => undefined),
      ...overrides,
    } satisfies MatchesApi;
    return api;
  };
  const mine = { ...loaded, venue: "Elsewhere ·rcv" };

  it("sends the same bytes the classic page sends, after one re-read", async () => {
    const api = fakeApi([row()]);
    const outcome = await saveMatches({ keys: ["m1"], drafts: { m1: mine }, pending: {}, stamps: { m1: "t1" }, originals: [savedMatch], api });
    expect(outcome).toMatchObject({ kind: "done", failed: [], pending: {} });
    expect(api.readAll).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(1);
    const [id, write] = (api.update as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    expect(id).toBe("m1");
    expect(JSON.stringify(write)).toBe(JSON.stringify(oldWrite(mine)));
  });
  it("gives conflict, and writes nothing, when someone changed a match you edited", async () => {
    const api = fakeApi([row({ updated_at: "t2", competition: "Cup" })]);
    const outcome = await saveMatches({ keys: ["m1"], drafts: { m1: mine }, pending: {}, stamps: { m1: "t1" }, originals: [savedMatch], api });
    expect(outcome).toMatchObject({ kind: "conflict", keys: ["m1"], stamps: { m1: "t2" } });
    expect(api.update).not.toHaveBeenCalled();
    expect(api.insert).not.toHaveBeenCalled();
  });
  it("gives conflict for a match deleted elsewhere, and none for matches nobody touched", async () => {
    const gone = await saveMatches({ keys: ["m1"], drafts: { m1: mine }, pending: {}, stamps: { m1: "t1" }, originals: [savedMatch], api: fakeApi([]) });
    expect(gone).toMatchObject({ kind: "conflict", keys: ["m1"] });
    const other = await saveMatches({ keys: ["m1"], drafts: { m1: mine }, pending: {}, stamps: { m1: "t1" }, originals: [savedMatch], api: fakeApi([row(), row({ id: "m2", updated_at: "t9" })]) });
    expect(other.kind).toBe("done");
  });
  it("sends nothing and reads nothing for an untouched page", async () => {
    const api = fakeApi([row()]);
    const outcome = await saveMatches({ keys: [], drafts: {}, pending: {}, stamps: { m1: "t1" }, originals: [savedMatch], api });
    expect(outcome).toMatchObject({ kind: "done", saved: [] });
    expect(api.readAll).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });
  it("keep my edits keeps the other person's fields and applies only mine", () => {
    const fresh = formFromMatch(row({ updated_at: "t2", competition: "Cup", attendance: 2000, venue: "Their venue" }));
    const rebased = rebaseForm(loaded, mine, fresh);
    expect(rebased.venue).toBe("Elsewhere ·rcv");
    expect(rebased.competition).toBe("Cup");
    expect(rebased.attendance).toBe(2000);
    expect(rebaseForm(loaded, structuredClone(loaded), fresh)).toEqual(fresh);
  });
  it("keeps a write that never answered, and Retry resends that exact request", async () => {
    const lost = fakeApi([row()], { update: vi.fn(async () => { throw new Error("network"); }) });
    const first = await saveMatches({ keys: ["m1"], drafts: { m1: mine }, pending: {}, stamps: { m1: "t1" }, originals: [savedMatch], api: lost });
    expect(first.kind).toBe("done");
    if (first.kind !== "done") return;
    expect(first.saved).toEqual([]);
    expect(first.failed).toEqual([]);
    expect(first.pending.m1.form).toEqual(mine);
    const sentFirst = JSON.stringify(buildMatchWrite(mine));
    // The page is locked while pending, but even a changed draft must not change what is resent. The row may already hold the first write, so no conflict check is made.
    const retry = fakeApi([row({ updated_at: "t-after-first-write" })]);
    const second = await saveMatches({ keys: ["m1"], drafts: { m1: { ...mine, venue: "changed again" } }, pending: first.pending, stamps: { m1: "t1" }, originals: [savedMatch], api: retry });
    expect(second).toMatchObject({ kind: "done", failed: [], pending: {} });
    expect(retry.readAll).not.toHaveBeenCalled();
    expect(JSON.stringify(((retry.update as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown])[1])).toBe(sentFirst);
  });
  it("does not add a match twice when the lost insert had landed", async () => {
    const draft = { ...emptyForm("s27"), date: "2027-05-01", time: "18:00", opponent: "Burbank Blaze", venue: "Field" };
    const lost = fakeApi([], { insert: vi.fn(async () => { throw new Error("network"); }) });
    const first = await saveMatches({ keys: ["new:1"], drafts: { "new:1": draft }, pending: {}, stamps: {}, originals: [], api: lost });
    if (first.kind !== "done") throw new Error("expected done");
    expect(first.pending["new:1"].form).toEqual(draft);
    const landed = row({ id: "created-1", season_id: "s27", date: "2027-05-01", time: "18:00:00", opponent: "Burbank Blaze" });
    const retry = fakeApi([landed]);
    const second = await saveMatches({ keys: ["new:1"], drafts: { "new:1": draft }, pending: first.pending, stamps: {}, originals: [], api: retry });
    expect(retry.insert).not.toHaveBeenCalled();
    expect(second).toMatchObject({ kind: "done", saved: [{ key: "new:1", id: "created-1" }], pending: {} });
    // If it had not landed, Retry sends the insert once.
    const empty = fakeApi([]);
    await saveMatches({ keys: ["new:1"], drafts: { "new:1": draft }, pending: first.pending, stamps: {}, originals: [], api: empty });
    expect(empty.insert).toHaveBeenCalledTimes(1);
  });
  it("asks for a retry, and sends nothing, when the re-read never answers", async () => {
    const api = fakeApi([row()], { readAll: vi.fn(async () => { throw new Error("network"); }) });
    const outcome = await saveMatches({ keys: ["m1"], drafts: { m1: mine }, pending: {}, stamps: { m1: "t1" }, originals: [savedMatch], api });
    expect(outcome).toMatchObject({ kind: "unverified", noAnswer: true });
    expect(api.update).not.toHaveBeenCalled();
    const said = fakeApi([row()], { readAll: vi.fn(async () => ({ rows: [], error: "boom" })) });
    expect(await saveMatches({ keys: ["m1"], drafts: { m1: mine }, pending: {}, stamps: { m1: "t1" }, originals: [savedMatch], api: said })).toMatchObject({ kind: "unverified", noAnswer: false });
  });
  it("treats an answer that says no as a failure to fix, not a retry", async () => {
    const api = fakeApi([row()], { update: vi.fn(async () => ({ error: "check violated" })) });
    const outcome = await saveMatches({ keys: ["m1"], drafts: { m1: mine }, pending: {}, stamps: { m1: "t1" }, originals: [savedMatch], api });
    expect(outcome).toMatchObject({ kind: "done", pending: {}, failed: [{ key: "m1", message: "check violated" }] });
  });
  it("wires conflict and retry to the page Save and the notice buttons", () => {
    expect(editor).toContain('setFailure("conflict")');
    expect(editor).toContain('setFailure("retry")');
    expect(editor).toContain("Load latest and keep my edits");
    expect(editor).toContain("Reload saved page");
    expect(editor).toContain("onConflict={() => keepRef.current?.focus()}");
    expect(editor).toContain("updated_at");
  });
});
