import { failContract } from "@/lib/contract-error";

export type RegistrationExportRow = {
  answers: Record<string, string | number | boolean | null | undefined>;
  priceLabel: string;
  amountCents: number;
  status: string;
  submittedAt: string;
};

function escapeCsv(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  // Spreadsheet applications evaluate cells beginning with these characters.
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function amountPaid(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    failContract("REGISTRATION_EXPORT_INVALID_AMOUNT");
  }
  return (amountCents / 100).toFixed(2);
}

/** Produces RFC 4180-compatible CSV for a form's registrations. */
export function buildRegistrationExportCsv(
  rows: readonly RegistrationExportRow[],
  configuredAnswerKeys: readonly string[] = [],
): string {
  const answerKeys: string[] = [];
  const seen = new Set<string>();
  for (const key of configuredAnswerKeys) {
    if (!seen.has(key)) {
      seen.add(key);
      answerKeys.push(key);
    }
  }
  for (const row of rows) {
    for (const key of Object.keys(row.answers)) {
      if (!seen.has(key)) {
        seen.add(key);
        answerKeys.push(key);
      }
    }
  }

  const headers = [
    ...answerKeys,
    "Price Label",
    "Amount Paid",
    "Status",
    "Submitted At",
  ];
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push([
      ...answerKeys.map((key) => row.answers[key]),
      row.priceLabel,
      amountPaid(row.amountCents),
      row.status,
      row.submittedAt,
    ].map(escapeCsv).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
