export const MAX_REGISTRATION_AMOUNT_CENTS = 100_000_000;

const MAX_REGISTRATION_DOLLARS = String(
  Math.trunc(MAX_REGISTRATION_AMOUNT_CENTS / 100),
);

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type RegistrationUsdParseResult =
  | { kind: "valid"; amountCents: number }
  | { kind: "empty" | "invalid" | "out_of_range" };

/**
 * Converts admin-entered dollars to integer cents without binary floating
 * point math. Additional decimal places are rounded half-up to the nearest
 * cent so values such as 130.999 become 13,100 cents deterministically.
 */
export function parseRegistrationUsdInput(
  rawValue: string,
): RegistrationUsdParseResult {
  const value = rawValue.trim();
  if (!value) return { kind: "empty" };

  // The fixed dollar prefix belongs to the UI. Reject pasted symbols, signs,
  // commas, and scientific notation instead of guessing at money input.
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value);
  if (!match) return { kind: "invalid" };

  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = match[2] ?? "";
  if (
    whole.length > MAX_REGISTRATION_DOLLARS.length ||
    (whole.length === MAX_REGISTRATION_DOLLARS.length &&
      whole > MAX_REGISTRATION_DOLLARS)
  ) {
    return { kind: "out_of_range" };
  }

  const fractionalCents = Number(`${fraction}00`.slice(0, 2));
  const roundedFractionalCents =
    fractionalCents +
    (fraction.length > 2 && fraction.charCodeAt(2) >= 53 ? 1 : 0);
  const amountCents = Number(whole) * 100 + roundedFractionalCents;

  return amountCents <= MAX_REGISTRATION_AMOUNT_CENTS
    ? { kind: "valid", amountCents }
    : { kind: "out_of_range" };
}

/** Dollar text used inside an input that renders its own fixed `$` prefix. */
export function formatRegistrationUsdInput(amountCents: number): string {
  assertRegistrationAmountCents(amountCents);
  return `${Math.trunc(amountCents / 100)}.${String(amountCents % 100).padStart(2, "0")}`;
}

export function formatRegistrationUsd(amountCents: number): string {
  assertRegistrationAmountCents(amountCents);
  return USD_FORMATTER.format(amountCents / 100);
}

function assertRegistrationAmountCents(amountCents: number): void {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0 ||
    amountCents > MAX_REGISTRATION_AMOUNT_CENTS
  ) {
    throw new RangeError(
      "Registration amount cents must be within the allowed range.",
    );
  }
}
