export const ADMIN_THEME_COOKIE_NAME = "onzio-admin-theme";
export const ADMIN_THEME_COOKIE_PATH = "/admin";
export const ADMIN_THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const ADMIN_THEMES = ["light", "dark"] as const;
export type AdminTheme = (typeof ADMIN_THEMES)[number];

export const DEFAULT_ADMIN_THEME: AdminTheme = "light";

export function resolveAdminTheme(value: string | null | undefined): AdminTheme {
  return value === "light" || value === "dark" ? value : DEFAULT_ADMIN_THEME;
}

export function serializeAdminThemeCookie(
  theme: AdminTheme,
  options: { secure?: boolean } = {},
): string {
  return [
    `${ADMIN_THEME_COOKIE_NAME}=${theme}`,
    `Path=${ADMIN_THEME_COOKIE_PATH}`,
    `Max-Age=${ADMIN_THEME_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    options.secure ? "Secure" : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}
