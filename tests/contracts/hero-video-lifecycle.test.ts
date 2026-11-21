import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HERO_VIDEO_LIVE_NOTICE_MS,
  effectiveHeroUploadState,
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
