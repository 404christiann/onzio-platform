import { describe, expect, it } from "vitest";
import {
  registrationFieldInsertRows,
  type Field,
} from "../../components/admin/registrations/registration-editor-model";

describe("registration field save payload", () => {
  it("edits the same form with uniform rows even when loaded fields carry database metadata", () => {
    const core: Field = {
      field_key: "player_name",
      label: "Player name",
      field_type: "name",
      options: [],
      required: true,
      is_core: true,
      participant_scope: "all",
      position: 0,
    };
    const custom: Field = {
      field_key: "  jersey_size  ",
      label: "  Jersey size  ",
      field_type: "dropdown",
      options: ["  Small  ", "", " Large "],
      required: false,
      is_core: false,
      participant_scope: "all",
      position: 9,
    };
    const loadedCustom = {
      ...custom,
      id: "old-field-id",
      club_id: "old-club-id",
      form_id: "old-form-id",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };

    const rows = registrationFieldInsertRows("existing-form-id", [core], [loadedCustom]);

    expect(rows).toEqual([
      { ...core, form_id: "existing-form-id" },
      {
        ...custom,
        form_id: "existing-form-id",
        field_key: "jersey_size",
        label: "Jersey size",
        options: ["Small", "Large"],
        position: 1,
      },
    ]);
    expect(rows.map((row) => Object.keys(row).sort())).toEqual([
      Object.keys(rows[0]).sort(),
      Object.keys(rows[0]).sort(),
    ]);
  });
});
