import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const ROSTER_ADMIN = "app/admin/(protected)/roster/page.tsx";
const FILE_UPLOAD = "components/admin/FileUpload.tsx";

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex, `Missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `Missing section end: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("admin roster player editor UX", () => {
  const roster = read(ROSTER_ADMIN);
  const fileUpload = read(FILE_UPLOAD);

  const staffTab = section(roster, "function StaffTab", "function SeasonStatsPanel");
  const actionPhotos = section(roster, "function ActionPhotosPanel", "function PlayerFormFields");
  const playerFields = section(roster, "function PlayerFormFields", "function StaffFormFields");

  it("uses friendly player-photo copy and a compact action-photo uploader", () => {
    expect(playerFields).toContain('label="Player photo"');
    expect(actionPhotos).toMatch(
      /<FileUpload[\s\S]*?label="Add action photos"[\s\S]*?density="compact"/,
    );
  });

  it("keeps fields mobile-first and restores wider responsive groupings", () => {
    expect(playerFields).toContain("grid-cols-1");
    expect(playerFields).toContain("sm:grid-cols-2");
  });

  it("keeps action-photo removal visible and usable by touch and keyboard", () => {
    const accessibleNameIndex = actionPhotos.indexOf("Delete action photo");
    const deleteButtonStart = actionPhotos.lastIndexOf("<button", accessibleNameIndex);
    const deleteButtonEnd = actionPhotos.indexOf("</button>", accessibleNameIndex);
    expect(deleteButtonStart).toBeGreaterThanOrEqual(0);
    expect(deleteButtonEnd).toBeGreaterThan(accessibleNameIndex);
    const deleteButton = actionPhotos.slice(deleteButtonStart, deleteButtonEnd);
    const className = deleteButton.match(/className="([^"]+)"/)?.[1] ?? "";
    expect(className).toContain("size-11");
    expect(className).toContain("focus-visible:ring");
    expect(deleteButton).not.toContain("opacity-0");
  });

  it("preserves the Academy inline season-stat gate", () => {
    expect(playerFields).toContain(
      'codeSiteAdminFor(club)?.roster.showInlineSeasonStats === false',
    );
    expect(playerFields).toContain("playerId && !hidesInlineSeasonStats");
  });

  it("keeps Staff in the classic dialog rather than the shared side panel", () => {
    expect(staffTab).toContain("<ClassicStaffDialog");
    expect(roster).not.toContain("<AdminSidePanel");
  });

  it("adds FileUpload presentation options without changing its existing defaults", () => {
    expect(fileUpload).toContain("previewLabel?: string;");
    expect(fileUpload).toContain('density?: "default" | "compact";');
    expect(fileUpload).toMatch(/density\s*=\s*"default"/);
    expect(fileUpload).toContain("multiple = false");
    expect(fileUpload).toContain("disabled = false");
    expect(fileUpload).toMatch(
      /displayName\s*=\s*[\s\S]*?fileMeta\?\.name\s*\?\?\s*previewLabel/,
    );
  });
});
