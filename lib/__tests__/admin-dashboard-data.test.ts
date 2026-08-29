import { describe, expect, it } from "vitest";
import { buildRegistrationMix } from "@/lib/admin-dashboard-mix";

describe("buildRegistrationMix", () => {
  const forms = Array.from({ length: 7 }, (_, index) => ({
    id: `form-${index + 1}`,
    title: `Form ${index + 1}`,
    createdAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
  }));

  it("counts only rows that belong to current forms", () => {
    expect(
      buildRegistrationMix(forms.slice(0, 2), [
        { formId: "form-1" },
        { formId: "form-1" },
        { formId: "archived-form" },
      ]),
    ).toEqual([{ id: "form-1", label: "Form 1", count: 2, percentage: 100 }]);
  });

  it("groups entries after the leading five into Other", () => {
    const registrations = forms.flatMap((form, index) =>
      Array.from({ length: 7 - index }, () => ({ formId: form.id })),
    );
    const result = buildRegistrationMix(forms, registrations);
    expect(result).toHaveLength(6);
    expect(result.at(-1)).toMatchObject({ id: "other", label: "Other", count: 3 });
  });

  it("uses stable tie ordering and exact whole percentages totaling 100", () => {
    const result = buildRegistrationMix(forms.slice(0, 3), [
      { formId: "form-1" },
      { formId: "form-2" },
      { formId: "form-3" },
    ]);
    expect(result.map((item) => item.id)).toEqual(["form-1", "form-2", "form-3"]);
    expect(result.map((item) => item.percentage)).toEqual([34, 33, 33]);
    expect(result.reduce((sum, item) => sum + item.percentage, 0)).toBe(100);
  });

  it("returns an empty mix when no current form has paid rows", () => {
    expect(buildRegistrationMix(forms, [])).toEqual([]);
  });
});
