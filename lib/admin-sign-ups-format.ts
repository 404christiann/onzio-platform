// ADMIN-RE-08: small wording helpers for "See registrations", safe for the client.

/** "$120" for whole dollars, "$120.50" otherwise. */
export function signUpAmount(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Up to two letters for the avatar: first and last word, whole characters only. */
export function signUpInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** The number to dial from a typed phone: digits and a leading +, without any extension. */
export function signUpDialNumber(phone: string): string {
  return phone.split(/\s*(?:ext\.?|extension|x)\s*\d/i)[0].replace(/[^\d+]/g, "");
}
