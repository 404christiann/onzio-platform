import { describe, expect, it } from "vitest";
import { ContractError } from "@/lib/contract-error";
import { buildRegistrationExportCsv } from "@/lib/registration-export";

describe("buildRegistrationExportCsv", () => {
  it("unions core and custom answer keys and includes registration payment fields", () => {
    expect(buildRegistrationExportCsv([
      {
        answers: { registrant_name: "Alex", guardian_email: "parent@example.com" },
        priceLabel: "Player Fee",
        amountCents: 17500,
        status: "paid",
        submittedAt: "2026-08-20T12:00:00.000Z",
      },
      {
        answers: { registrant_name: "Sam", jersey_size: "L" },
        priceLabel: "Scholarship",
        amountCents: 0,
        status: "paid",
        submittedAt: "2026-08-21T12:00:00.000Z",
      },
    ])).toBe(
      "registrant_name,guardian_email,jersey_size,Price Label,Amount Paid,Status,Submitted At\r\n" +
      "Alex,parent@example.com,,Player Fee,175.00,paid,2026-08-20T12:00:00.000Z\r\n" +
      "Sam,,L,Scholarship,0.00,paid,2026-08-21T12:00:00.000Z\r\n",
    );
  });

  it("escapes commas, quotes, and newlines according to CSV rules", () => {
    expect(buildRegistrationExportCsv([{
      answers: { notes: 'Needs "extra", support\nplease call' },
      priceLabel: "Early, Bird",
      amountCents: 2500,
      status: "pending",
      submittedAt: "2026-08-20T12:00:00.000Z",
    }])).toContain(
      '"Needs ""extra"", support\nplease call","Early, Bird",25.00,pending',
    );
  });

  it("neutralizes spreadsheet formulas before applying CSV escaping", () => {
    expect(buildRegistrationExportCsv([{
      answers: {
        formula: "=SUM(A1:A2)",
        plus: "+1+1",
        minus: "-1+1",
        at: "@SUM(A1:A2)",
        quotedFormula: '=HYPERLINK("https://example.com",\n"Open")',
      },
      priceLabel: "Fee",
      amountCents: 1000,
      status: "paid",
      submittedAt: "2026-08-20T12:00:00.000Z",
    }])).toContain(
      "'=SUM(A1:A2),'+1+1,'-1+1,'@SUM(A1:A2),\"'=HYPERLINK(\"\"https://example.com\"\",\n\"\"Open\"\")\"",
    );
  });

  it("keeps configured columns for an empty roster and appends historical keys", () => {
    expect(buildRegistrationExportCsv([], ["registrant_name", "jersey_size"]))
      .toBe("registrant_name,jersey_size,Price Label,Amount Paid,Status,Submitted At\r\n");

    expect(buildRegistrationExportCsv([{
      answers: { retired_field: "value" },
      priceLabel: "Fee",
      amountCents: 1000,
      status: "paid",
      submittedAt: "2026-08-20T12:00:00.000Z",
    }], ["registrant_name"]))
      .toContain("registrant_name,retired_field,Price Label");
  });

  it("rejects invalid payment amounts", () => {
    expect(() => buildRegistrationExportCsv([{
      answers: {}, priceLabel: "Fee", amountCents: -1, status: "paid", submittedAt: "now",
    }])).toThrow(ContractError);
  });
});
