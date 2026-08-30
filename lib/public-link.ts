export function normalizePublicHref(value: unknown): string {
  if (typeof value !== "string" || value === "" || value !== value.trim()) {
    return "";
  }
  if (/^\/(?![\\/])/.test(value)) return value;

  const isWebUrl = value.startsWith("http://") || value.startsWith("https://");
  const isEmailUrl = value.startsWith("mailto:") && value.length > "mailto:".length;
  if (!isWebUrl && !isEmailUrl) return "";

  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}

export function isAllowedPublicHref(value: string): boolean {
  return value === "" || normalizePublicHref(value) !== "";
}
