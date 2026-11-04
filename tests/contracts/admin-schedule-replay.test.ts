import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schedule = readFileSync(resolve(process.cwd(), "app/admin/(protected)/schedule/page.tsx"), "utf8");
const between = (start: string, end: string) => {
  const from = schedule.indexOf(start);
  const to = schedule.indexOf(end, from + start.length);
  expect(from, start).toBeGreaterThanOrEqual(0);
  expect(to, end).toBeGreaterThan(from);
  return schedule.slice(from, to);
};

describe("admin schedule replay video field", () => {
  const result = between('title="Result"', "</MatchFormSection>");
  const validate = between("function validate(", "async function handleAdd(");

  it("offers a labelled YouTube field in the Result section for cinematic@2 clubs only", () => {
    expect(result).toContain('club.presentationTemplateKey === "cinematic@2"');
    expect(result).toContain('<Field id="match-replay-video" label="Replay video (YouTube link)" optional>');
    expect(result).toContain('id="match-replay-video"');
    expect(result).toContain('type="url"');
    expect(result).toContain('value={form.replay_video_url ?? ""}');
  });
  it("refuses links that are not a single YouTube video before saving", () => {
    expect(validate).toContain("matchReplayEmbedUrl(form.replay_video_url ?? \"\") === null");
    expect(validate).toContain("Replay video must be a YouTube video link");
  });
  it("loads, edits and saves the stored embed link, clearing a blank field", () => {
    expect(schedule).toContain('import { matchReplayEmbedUrl } from "@/lib/youtube-embed";');
    expect(between('.from("matches")\n        .select("', '")')).toContain("replay_video_url");
    expect(between("function startEdit(", "});")).toContain("replay_video_url: m.replay_video_url ?? null");
    expect(schedule.split("replay_video_url: matchReplayEmbedUrl(").length - 1).toBe(2);
    expect(schedule).toContain("replay_video_url: null, season_id: seasonId");
  });
});
