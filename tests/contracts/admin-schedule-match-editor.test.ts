import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const SCHEDULE_ADMIN = "app/admin/(protected)/schedule/page.tsx";
const SIDE_PANEL = "components/admin/AdminSidePanel.tsx";

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  expect(startIndex, `Missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `Missing section end: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function count(source: string, value: string): number {
  return source.split(value).length - 1;
}

describe("admin schedule match editor UX", () => {
  const schedule = read(SCHEDULE_ADMIN);
  const sidePanel = read(SIDE_PANEL);
  const panel = section(schedule, "<AdminSidePanel", "</AdminSidePanel>");
  const panelProps = panel.slice(0, panel.indexOf("<MatchForm"));
  const panelBody = panel.slice(panel.indexOf("<MatchForm"));
  const matchForm = section(
    schedule,
    "function MatchForm(",
    "function OpponentLogoUpload",
  );
  const matchFormSection = schedule.slice(
    schedule.indexOf("function MatchFormSection("),
  );
  const field = schedule.slice(schedule.indexOf("function Field("));

  it("opts only the schedule editor into a wider panel with fixed actions", () => {
    expect(sidePanel).toContain("max-w-md");
    expect(panelProps).toContain('className="max-w-2xl"');
    expect(panelProps).toContain("footer={");
    expect(panelProps).toContain('role="alert"');
    expect(panelProps).toContain("Delete");
    expect(panelProps).toContain("Cancel");
    expect(panelProps).toContain(
      "onClick={editingId ? handleSaveEdit : handleAdd}",
    );

    expect(panelBody).not.toContain('role="alert"');
    expect(panelBody).not.toContain(">Delete<");
    expect(panelBody).not.toContain(">Cancel<");
    expect(panelBody).not.toContain("handleSaveEdit");
  });

  it("keeps fixed actions responsive and touch friendly", () => {
    expect(panelProps).toContain(
      "flex flex-col gap-3 sm:flex-row sm:items-center",
    );
    expect(panelProps).toContain(
      "grid w-full grid-cols-2 gap-3 sm:ml-auto sm:flex sm:w-auto",
    );
    expect(count(panelProps, "min-h-11")).toBeGreaterThanOrEqual(3);
    const deleteAction = section(panelProps, "{editingId && (", "</button>");
    expect(deleteAction).toContain("w-full");
    expect(deleteAction).toContain("sm:w-auto");
  });

  it("presents the form as five ordered, semantically labelled sections", () => {
    expect(matchFormSection).toContain("<section");
    expect(matchFormSection).toContain("aria-labelledby={id}");
    expect(matchFormSection).toContain("id={id}");

    const orderedSections = [
      'title="Match details"',
      'title="Opponent"',
      'title="Venue"',
      'title="Result"',
      'title="Presented by"',
    ];
    let previousIndex = -1;
    for (const title of orderedSections) {
      const index = matchForm.indexOf(title);
      expect(index, `${title} should be present`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }

    for (const headingId of [
      "match-details-heading",
      "opponent-heading",
      "venue-heading",
      "result-heading",
      "sponsor-heading",
    ]) {
      expect(matchForm).toContain(`id="${headingId}"`);
    }
    expect(matchForm).toContain(
      "Leave both scores blank until the match is played.",
    );
  });

  it("uses mobile-first fields with deliberate tablet and desktop groupings", () => {
    expect(matchForm).toContain('className="space-y-8"');
    expect(
      count(matchForm, "grid grid-cols-1 gap-4 sm:grid-cols-2"),
    ).toBeGreaterThanOrEqual(3);
    expect(matchForm).toContain("sm:col-span-2");
    expect(matchForm).toContain(
      "grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]",
    );
  });

  it("associates every visible field label with a stable control id", () => {
    expect(field).toContain("id: string;");
    expect(field).toContain("<label");
    expect(field).toContain("htmlFor={id}");

    for (const controlId of [
      "match-season",
      "match-home-away",
      "match-date",
      "match-time",
      "match-competition",
      "match-opponent",
      "match-opponent-short-name",
      "match-venue",
      "match-address",
      "match-city",
      "match-state",
      "match-club-score",
      "match-opponent-score",
      "match-sponsor-name",
      "match-sponsor-link",
    ]) {
      expect(
        count(matchForm, `id="${controlId}"`),
        `${controlId} should connect its Field label and control`,
      ).toBeGreaterThanOrEqual(2);
    }

    for (const uploadId of ["match-opponent-logo", "match-sponsor-logo"]) {
      expect(matchForm).toContain(`<Field id="${uploadId}"`);
      expect(matchForm).toContain(`inputId="${uploadId}"`);
    }
    expect(count(schedule, "id={inputId}")).toBe(2);
  });

  it("keeps date and media actions usable as touch targets", () => {
    expect(matchForm).toMatch(
      /id="match-date"[\s\S]*?className="min-h-11 w-full/,
    );
    const opponentUpload = section(
      schedule,
      "function OpponentLogoUpload(",
      "function SponsorLogoUpload(",
    );
    const sponsorUpload = section(
      schedule,
      "function SponsorLogoUpload(",
      "function Field(",
    );
    expect(opponentUpload).toContain("min-h-11");
    expect(opponentUpload).toContain('"Upload opponent logo"');
    expect(opponentUpload).toContain('aria-label="Remove opponent logo"');
    expect(sponsorUpload).toContain("min-h-11");
    expect(sponsorUpload).toContain('"Upload sponsor logo"');
    expect(sponsorUpload).toContain('aria-label="Remove sponsor logo"');
  });

  it("keeps add and edit on the same form and mutation boundaries", () => {
    expect(panelBody).toContain("form={panelForm}");
    expect(panelBody).toContain("onChange={panelOnChange}");
    expect(panelBody).toContain("seasons={seasons}");
    expect(panelBody).toContain("cleanupDraftUploads={!editingId}");
    expect(panelProps).toContain("{editingId && (");
    expect(panelProps).toContain("handleDelete(editingId)");
  });

  it("keeps the presented-by section behind the existing template gate", () => {
    expect(matchForm).toContain(
      "const hidesMatchSponsorFields = isAcademy || isEditorial;",
    );
    const sponsorGateStart = matchForm.indexOf("{!hidesMatchSponsorFields && (");
    expect(sponsorGateStart).toBeGreaterThanOrEqual(0);
    const sponsorGate = matchForm.slice(sponsorGateStart);
    expect(sponsorGate).toContain('title="Presented by"');
    expect(sponsorGate).toContain('id="sponsor-heading"');
  });
});
