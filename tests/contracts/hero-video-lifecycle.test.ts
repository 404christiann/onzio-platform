import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  effectiveHeroUploadState,
  shouldExpireUpload,
  uploadDeadlineMs,
  type HeroEffective,
  type HeroStoredPhase,
} from "@/lib/hero-video-lifecycle";

const sql = readFileSync("supabase/migrations/20261121183000_hero_video_pending.sql", "utf8");
const at = (iso: string) => Date.parse(iso);
const row = (phase: HeroStoredPhase, deadlineAt: string | null) => ({ phase, deadlineAt });

describe("effective hero upload state", () => {
  const now = at("2026-11-21T10:15:00.000Z");
  const cases: Array<[string, HeroStoredPhase | null, string | null, HeroEffective]> = [
    ["no row", null, null, "idle"],
    ["uploading inside the window", "uploading", "2026-11-21T11:15:00.000Z", "uploading"],
    ["uploading past the deadline", "uploading", "2026-11-21T10:14:00.000Z", "uploading_overdue"],
    ["preparing inside the deadline", "preparing", "2026-11-21T12:15:00.000Z", "preparing"],
    ["preparing past the deadline", "preparing", "2026-11-21T10:14:00.000Z", "preparing_overdue"],
    ["live", "live", null, "live"],
    ["failed", "failed", null, "failed"],
    ["abandoned", "abandoned", null, "abandoned"],
  ];
  it.each(cases)("%s", (_label, phase, deadlineAt, expected) => {
    expect(effectiveHeroUploadState(phase ? row(phase, deadlineAt) : null, now)).toBe(expected);
  });

  it("a slow upload started at 01:00 is still uploading at the 02:15 cron and at 02:40", () => {
    const started = at("2026-11-21T09:00:00.000Z");
    const deadline = new Date(started + uploadDeadlineMs()).toISOString();
    expect(shouldExpireUpload(row("uploading", deadline), at("2026-11-21T10:15:00.000Z"), false)).toBe(false);
    expect(shouldExpireUpload(row("uploading", deadline), at("2026-11-21T10:40:00.000Z"), true)).toBe(false);
    expect(effectiveHeroUploadState(row("uploading", deadline), at("2026-11-21T10:40:00.000Z"))).toBe("uploading");
  });

  it("breaking the deadline filter would expire that slow upload", () => {
    const started = at("2026-11-21T09:00:00.000Z");
    const deadline = new Date(started + uploadDeadlineMs()).toISOString();
    expect(shouldExpireUpload(row("uploading", deadline), at("2026-11-21T10:15:00.000Z"), false)).toBe(false);
    expect(sql).toContain("deadline_at <= pg_catalog.now()");
    expect(sql).toContain("where club_id = p_club_id and video_guid = p_video_guid and phase = any(p_expected)");
    expect(sql).not.toContain("consume_hero_video_replace");
  });
});
