import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROSE_CITY_CLUB_ID } from "../../scripts/rose-city-2027-operator-sql";

// The rollback and operator SQL now live in the private onzio-ops repo, which this repo's CI cannot read, so
// `npm run test:ops` (tests/contracts/hero-video-poster-migration.test.ts and the two rose-city-*-operator-sql
// contracts) runs in onzio-ops CI instead. These are the files here those checks compare the SQL against.
// When one changes this test fails on the PR: run `npm run test:ops` with ../onzio-ops checked out, fix the SQL
// in onzio-ops if it no longer matches, then update the pin below.
const PINNED_FILES: Record<string, string> = {
  "supabase/migrations/20261124120000_hero_video_poster.sql": "437d5bfbc71c8118b7a1d635cbca72acdf84a274850cbb6ae81be931a1d2b1aa",
  "supabase/migrations/20261120230000_hero_video_swap.sql": "d848b328776302fe78281fdcdd915f777a37568483fe74d801ef3d26e0ea4bf1",
  "supabase/migrations/20261121183000_hero_video_pending.sql": "415001109e2e47fd7157f113c8dcc0da330a1ed7f4f334c7eee1c1af5d6c50d1",
};

const sha256 = (text: string) => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");

describe("files the onzio-ops SQL checks compare against", () => {
  it.each(Object.entries(PINNED_FILES))("%s is unchanged (else run npm run test:ops with onzio-ops)", (file, pinned) => {
    expect(sha256(readFileSync(resolve(process.cwd(), file), "utf8"))).toBe(pinned);
  });

  it("Rose City's club id, which the operator SQL targets, is unchanged (else run npm run test:ops with onzio-ops)", () => {
    expect(ROSE_CITY_CLUB_ID).toBe("32ceba0b-4e25-52c2-bb6b-d82fb87637a7");
  });
});
