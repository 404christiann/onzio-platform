import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as lifecycle from "@/lib/hero-video-lifecycle";
import {
  HERO_VIDEO_LIVE_NOTICE_MS,
  HERO_VIDEO_MP4_GRACE_MS,
  HERO_VIDEO_REPLACES_PER_DAY,
  effectiveHeroUploadState,
  isHeroMp4GraceOpen,
  uploadDeadlineMs,
  type HeroEffective,
  type HeroStoredPhase,
} from "@/lib/hero-video-lifecycle";

const sql = readFileSync("supabase/migrations/20261121183000_hero_video_pending.sql", "utf8");
const at = (iso: string) => Date.parse(iso);
const row = (phase: HeroStoredPhase, deadlineAt: string | null, updatedAt?: string | null) => ({ phase, deadlineAt, updatedAt });

describe("effective hero upload state", () => {
  const now = at("2026-11-21T10:15:00.000Z");
  const cases: Array<[string, HeroStoredPhase | null, string | null, HeroEffective]> = [
    ["no row", null, null, "idle"],
    ["uploading inside the window", "uploading", "2026-11-21T11:15:00.000Z", "uploading"],
    ["uploading past the deadline", "uploading", "2026-11-21T10:14:00.000Z", "uploading_overdue"],
    ["preparing inside the deadline", "preparing", "2026-11-21T12:15:00.000Z", "preparing"],
    ["preparing past the deadline", "preparing", "2026-11-21T10:14:00.000Z", "preparing_overdue"],
    ["live, updated a minute ago", "live", null, "live"],
    ["failed", "failed", null, "failed"],
    ["abandoned", "abandoned", null, "abandoned"],
  ];
  it.each(cases)("%s", (_label, phase, deadlineAt, expected) => {
    expect(effectiveHeroUploadState(phase ? row(phase, deadlineAt, "2026-11-21T10:14:00.000Z") : null, now)).toBe(expected);
  });

  it("a live row is live for HERO_VIDEO_LIVE_NOTICE_MS after updated_at, then idle", () => {
    const updated = at("2026-11-21T10:00:00.000Z");
    const live = row("live", null, new Date(updated).toISOString());
    expect(effectiveHeroUploadState(live, updated)).toBe("live");
    expect(effectiveHeroUploadState(live, updated + HERO_VIDEO_LIVE_NOTICE_MS - 1)).toBe("live");
    expect(effectiveHeroUploadState(live, updated + HERO_VIDEO_LIVE_NOTICE_MS)).toBe("idle");
    expect(effectiveHeroUploadState(live, updated + 60 * 60 * 1000)).toBe("idle");
  });

  it("a live row with a missing or unreadable updated_at is idle, never a stale notice", () => {
    expect(effectiveHeroUploadState(row("live", null), now)).toBe("idle");
    expect(effectiveHeroUploadState(row("live", null, null), now)).toBe("idle");
    expect(effectiveHeroUploadState(row("live", null, "not a date"), now)).toBe("idle");
  });

  it("the notice window does not touch failed or abandoned rows", () => {
    expect(effectiveHeroUploadState(row("failed", null, "2026-11-21T01:00:00.000Z"), now)).toBe("failed");
    expect(effectiveHeroUploadState(row("abandoned", null, "2026-11-21T01:00:00.000Z"), now)).toBe("abandoned");
  });

  it("a slow upload started at 01:00 is still uploading at the 02:15 cron and at 02:40", () => {
    const started = at("2026-11-21T09:00:00.000Z");
    const deadline = new Date(started + uploadDeadlineMs()).toISOString();
    expect(effectiveHeroUploadState(row("uploading", deadline), at("2026-11-21T10:15:00.000Z"))).toBe("uploading");
    expect(effectiveHeroUploadState(row("uploading", deadline), at("2026-11-21T10:40:00.000Z"))).toBe("uploading");
  });

  it("the database, not the app, refuses to expire a row before its deadline", () => {
    expect(sql).toContain("deadline_at <= pg_catalog.now()");
    expect(sql).toContain("where club_id = p_club_id and video_guid = p_video_guid and phase = any(p_expected)");
    expect(sql).not.toContain("consume_hero_video_replace");
  });
});

describe("hero video limits and copy", () => {
  it("ten replacements a day, inside the database's accepted range for the cap", () => {
    expect(HERO_VIDEO_REPLACES_PER_DAY).toBe(10);
    expect(sql).toContain("p_cap is null or p_cap < 1 or p_cap > 50");
  });

  it("the upload-done moment is gone, and the progress and failure copy is the agreed plain text", () => {
    expect(lifecycle).not.toHaveProperty("HERO_VIDEO_UPLOAD_DONE_MS");
    expect(lifecycle).not.toHaveProperty("HERO_VIDEO_PREPARING_COPY");
    expect([lifecycle.HERO_VIDEO_UPLOADING_COPY, lifecycle.HERO_VIDEO_PROCESSING_COPY, lifecycle.HERO_VIDEO_LIVE_COPY, lifecycle.HERO_VIDEO_LEAVE_COPY, lifecycle.HERO_VIDEO_FAILED_COPY]).toEqual([
      "Uploading…", "Processing…", "Your new video is live.", "You can leave this page; we'll finish in the background.", "We couldn't finish this video. Try again or use a different file.",
    ]);
  });
});

describe("MP4 grace", () => {
  const landed = at("2026-11-21T10:00:00.000Z");
  const iso = (ms: number) => new Date(ms).toISOString();

  it("is 15 minutes, shorter than the prepare deadline", () => {
    expect(HERO_VIDEO_MP4_GRACE_MS).toBe(15 * 60 * 1000);
    expect(HERO_VIDEO_MP4_GRACE_MS).toBeLessThan(lifecycle.PREPARE_DEADLINE_MS);
  });

  it("is open for the 15 minutes after landed_at and closed from the 15th minute on", () => {
    expect(isHeroMp4GraceOpen({ landedAt: iso(landed) }, landed)).toBe(true);
    expect(isHeroMp4GraceOpen({ landedAt: iso(landed) }, landed + 60_000)).toBe(true);
    expect(isHeroMp4GraceOpen({ landedAt: iso(landed) }, landed + HERO_VIDEO_MP4_GRACE_MS - 1)).toBe(true);
    expect(isHeroMp4GraceOpen({ landedAt: iso(landed) }, landed + HERO_VIDEO_MP4_GRACE_MS)).toBe(false);
    expect(isHeroMp4GraceOpen({ landedAt: iso(landed) }, landed + 16 * 60_000)).toBe(false);
  });

  it("falls back to started_at when landed_at is missing or unreadable", () => {
    for (const landedAt of [undefined, null, "", "not a date"]) {
      expect(isHeroMp4GraceOpen({ landedAt, startedAt: iso(landed) }, landed + 60_000)).toBe(true);
      expect(isHeroMp4GraceOpen({ landedAt, startedAt: iso(landed) }, landed + 16 * 60_000)).toBe(false);
    }
  });

  it("prefers landed_at over started_at", () => {
    expect(isHeroMp4GraceOpen({ landedAt: iso(landed), startedAt: iso(landed - 60 * 60_000) }, landed + 60_000)).toBe(true);
    expect(isHeroMp4GraceOpen({ landedAt: iso(landed - 60 * 60_000), startedAt: iso(landed) }, landed + 60_000)).toBe(false);
  });

  it("is closed when neither time can be read, so a row is never retried forever", () => {
    expect(isHeroMp4GraceOpen({}, landed)).toBe(false);
    expect(isHeroMp4GraceOpen({ landedAt: null, startedAt: null }, landed)).toBe(false);
    expect(isHeroMp4GraceOpen({ landedAt: "nope", startedAt: "nope" }, landed)).toBe(false);
  });
});
