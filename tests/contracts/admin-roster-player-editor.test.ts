import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const ROSTER_ADMIN = "app/admin/(protected)/roster/page.tsx";
const SIDE_PANEL = "components/admin/AdminSidePanel.tsx";
const FILE_UPLOAD = "components/admin/FileUpload.tsx";

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex, `Missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `Missing section end: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function openingTag(source: string, component: string): string {
  const match = source.match(new RegExp(`<${component}[\\s\\S]*?\\n\\s*>`));
  expect(match, `Missing opening tag: ${component}`).not.toBeNull();
  return match![0];
}

describe("admin roster player editor UX", () => {
  const roster = read(ROSTER_ADMIN);
  const sidePanel = read(SIDE_PANEL);
  const fileUpload = read(FILE_UPLOAD);

  const rosterShell = section(roster, "export default function RosterPage", "// ── Players tab");
  const playersTab = section(roster, "function PlayersTab", "function PlayerPositionGroup");
  const staffTab = section(roster, "function StaffTab", "function SeasonStatsPanel");
  const actionPhotos = section(roster, "function ActionPhotosPanel", "function PlayerFormFields");
  const playerFields = section(roster, "function PlayerFormFields", "function StaffFormFields");

  it("pairs the roster tabs with one responsive contextual add action", () => {
    expect(rosterShell).toContain('role="tablist"');
    expect(rosterShell).toContain('aria-label="Roster sections"');
    expect(rosterShell).toContain('role="tab"');
    expect(rosterShell).toContain("aria-selected={tab === rosterTab}");
    expect(rosterShell).toContain("aria-controls={`roster-${rosterTab}-panel`}");
    expect(rosterShell).toContain('event.key === "ArrowRight"');
    expect(rosterShell).toContain('event.key === "ArrowLeft"');
    expect(rosterShell).toContain('event.key === "Home"');
    expect(rosterShell).toContain('event.key === "End"');
    expect(rosterShell).toContain('tab === "players" ? "Add player" : "Add staff"');
    expect(rosterShell).toMatch(/min-h-11 w-full[\s\S]*?sm:w-auto/);
    expect(rosterShell).toContain("<PlayersTab addRequest={addRequests.players}");
    expect(rosterShell).toContain("<StaffTab addRequest={addRequests.staff}");
    expect(playersTab).not.toContain("+ Add Player");
    expect(staffTab).not.toContain("+ Add Staff");
  });

  it("keeps the shared panel default narrow while letting the player editor opt into a wider panel", () => {
    expect(sidePanel).toContain("className?: string;");
    expect(sidePanel).toMatch(/max-w-md/);

    const playerPanel = section(playersTab, "<AdminSidePanel", "</AdminSidePanel>");
    expect(openingTag(playerPanel, "AdminSidePanel")).toMatch(
      /className=["{][\s\S]*?max-w-(?:lg|xl|2xl)/,
    );

    const staffPanel = section(staffTab, "<AdminSidePanel", "</AdminSidePanel>");
    expect(openingTag(staffPanel, "AdminSidePanel")).not.toMatch(/\bclassName=/);
  });

  it("supports an optional fixed footer outside the panel's scrolling form region", () => {
    expect(sidePanel).toContain("footer?: ReactNode;");
    expect(sidePanel).toMatch(/function AdminSidePanel\([\s\S]*?footer/);
    expect(sidePanel).toMatch(
      /overflow-y-auto[\s\S]*?<SlidingPanel[\s\S]*?<\/SlidingPanel>\s*<\/div>\s*\{footer\s*&&/,
    );

    const footerBlock = sidePanel.slice(sidePanel.indexOf("{footer &&"));
    expect(footerBlock).toContain("flex-none");
    expect(footerBlock).toContain("border-t");
  });

  it("puts only the player save and cancel actions in that fixed footer", () => {
    const playerPanel = section(playersTab, "<AdminSidePanel", "</AdminSidePanel>");
    const footer = section(playerPanel, "footer={", "\n        }\n      >");
    expect(playerPanel).toContain("Player status");
    expect(playerPanel).toMatch(/Deactivate|Activate/);
    expect(footer).toContain("Cancel");
    expect(footer).toContain("Save changes");
    expect(footer).not.toContain("Player status");
    expect(footer).not.toMatch(/Deactivate|Activate/);
  });

  it("requires a second, explicit action before deactivating a player", () => {
    expect(playersTab).toContain("confirmingDeactivation");
    expect(playersTab).toContain('aria-label="Confirm player deactivation"');
    expect(playersTab).toContain("Keep active");
    expect(playersTab).toContain("Confirm");
  });

  it("uses friendly player-photo copy and a compact action-photo uploader", () => {
    expect(playerFields).toContain('previewLabel="Player photo"');
    expect(actionPhotos).toMatch(
      /<FileUpload[\s\S]*?label="Add action photos"[\s\S]*?density="compact"/,
    );
  });

  it("keeps fields mobile-first and restores wider responsive groupings", () => {
    expect(playerFields).toContain("grid-cols-1");
    expect(playerFields).toMatch(
      /sm:grid-cols-\[[^\]]*minmax\(0,1fr\)[^\]]*\]/,
    );
    expect(playerFields).toContain("sm:grid-cols-2");
    expect(playerFields).toContain("sm:grid-cols-3");
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

  it("preserves the academy and editorial inline season-stat gate", () => {
    expect(playerFields).toContain(
      'club.presentationTemplateKey === "academy@1"',
    );
    expect(playerFields).toContain(
      'club.presentationTemplateKey === "editorial@1"',
    );
    expect(playerFields).toContain("playerId && !hidesInlineSeasonStats");
  });

  it("does not opt Staff into the player-specific width or footer treatment", () => {
    const staffPanel = section(staffTab, "<AdminSidePanel", "</AdminSidePanel>");
    expect(staffPanel).not.toContain("footer={");
    expect(openingTag(staffPanel, "AdminSidePanel")).not.toMatch(/\bclassName=/);
    expect(roster.match(/<AdminSidePanel/g)).toHaveLength(2);
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
