export function registrationPublicUrl(input: {
  currentOrigin: string;
  primaryDomain: string;
  formSlug: string;
}): string {
  const current = new URL(input.currentOrigin);
  const localRequest = current.hostname === "localhost" ||
    current.hostname.endsWith(".localhost");
  const origin = localRequest
    ? current.origin
    : `https://${input.primaryDomain}`;
  return new URL(`/register/${encodeURIComponent(input.formSlug)}`, origin).href;
}
