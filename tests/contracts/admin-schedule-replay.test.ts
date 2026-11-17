import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The Schedule page keeps loading, validation and saving; the form fields live
// in ScheduleMatchForm.tsx and the empty form in schedule-model.ts.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const schedule = read("app/admin/(protected)/schedule/page.tsx");
const form = read("components/admin/schedule/ScheduleMatchForm.tsx");
const model = read("components/admin/schedule/schedule-model.ts");
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, start).toBeGreaterThanOrEqual(0);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
};

describe("admin schedule replay video field", () => {
  const result = between(form, 'title="Result"', "</MatchFormSection>");
  const validate = between(schedule, "function validate(", "async function handleAdd(");

  it("offers a labelled YouTube field in the Result section for cinematic@2 clubs only", () => {
    expect(result).toContain('club.presentationTemplateKey === "cinematic@2"');
    // RC2027-MATCH-SUMMARY: the same link is the stream before kickoff and the replay afterwards.
    expect(result).toMatch(/<Field\s+id="match-replay-video"\s+label="Stream or replay video \(YouTube link\)"\s+optional\b/);
    expect(result).toContain('id="match-replay-video"');
    expect(result).toContain('type="url"');
    expect(result).toContain('value={form.replay_video_url ?? ""}');
  });
  it("refuses links that are not a single YouTube video before saving", () => {
    expect(validate).toContain("matchReplayEmbedUrl(form.replay_video_url ?? \"\") === null");
    expect(validate).toContain("The stream or replay video must be a YouTube video link");
  });
  it("loads, edits and saves the stored embed link, clearing a blank field", () => {
    expect(schedule).toContain('import { matchReplayEmbedUrl } from "@/lib/youtube-embed";');
    expect(between(schedule, '.from("matches")\n        .select("', '")')).toContain("replay_video_url");
    expect(between(schedule, "function startEdit(", "});")).toContain("replay_video_url: m.replay_video_url ?? null");
    expect(schedule.split("replay_video_url: matchReplayEmbedUrl(").length - 1).toBe(2);
    expect(model).toContain("replay_video_url: null, attendance: null,");
  });
});
