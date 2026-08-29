import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_THEME_COOKIE_NAME,
  DEFAULT_ADMIN_THEME,
  resolveAdminTheme,
  serializeAdminThemeCookie,
} from "@/lib/admin-theme";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("protected admin theme contract", () => {
  it("defaults to light and accepts only explicit light or dark values", () => {
    expect(DEFAULT_ADMIN_THEME).toBe("light");
    expect(resolveAdminTheme(undefined)).toBe("light");
    expect(resolveAdminTheme(null)).toBe("light");
    expect(resolveAdminTheme("system")).toBe("light");
    expect(resolveAdminTheme("LIGHT")).toBe("light");
    expect(resolveAdminTheme("light")).toBe("light");
    expect(resolveAdminTheme("dark")).toBe("dark");
  });

  it("persists an explicit choice only on the admin path", () => {
    expect(serializeAdminThemeCookie("dark")).toBe(
      `${ADMIN_THEME_COOKIE_NAME}=dark; Path=/admin; Max-Age=31536000; SameSite=Lax`,
    );
    expect(serializeAdminThemeCookie("light", { secure: true })).toBe(
      `${ADMIN_THEME_COOKIE_NAME}=light; Path=/admin; Max-Age=31536000; SameSite=Lax; Secure`,
    );

    const provider = source("components/admin/AdminThemeProvider.tsx");
    expect(provider).toContain("document.cookie = serializeAdminThemeCookie");
    expect(provider).not.toMatch(/localStorage|matchMedia|prefers-color-scheme/);
  });

  it("renders the server-selected theme and an accessible shell toggle", () => {
    const provider = source("components/admin/AdminThemeProvider.tsx");
    const toggle = source("components/admin/AdminThemeToggle.tsx");

    expect(provider).toContain("useState<AdminTheme>(initialTheme)");
    expect(provider).toContain('className="admin-theme"');
    expect(provider).toContain("data-admin-theme={theme}");
    expect(toggle).toContain('type="button"');
    expect(toggle).toContain('aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}');
    expect(toggle).toContain("aria-pressed={isDark}");
    expect(toggle).toContain("Dark theme enabled");
    expect(toggle).toContain("Light theme enabled");
  });

  it("reads the cookie asynchronously after preserving every auth and tenant gate", () => {
    const layout = source("app/admin/(protected)/layout.tsx");
    expect(layout).toContain("requireFreshClubSession(supabase)");
    expect(layout).toContain('error.code === "SESSION_EXPIRED"');
    expect(layout).toContain("await supabase.auth.signOut()");
    expect(layout).toContain("getClubContext({");
    expect(layout).toContain('club.lifecycle === "archived"');
    expect(layout).toContain(
      '(club.role !== "owner" && club.role !== "admin")',
    );
    expect(layout).toContain("const cookieStore = await cookies()");
    expect(layout).toContain("cookieStore.get(ADMIN_THEME_COOKIE_NAME)?.value");
    expect(layout).toContain("<AdminThemeProvider initialTheme={initialTheme}>");
  });

  it("keeps theme tokens protected-only and leaves public and login layouts outside the provider", () => {
    const css = source("styles/globals.css");
    const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));

    expect(rootBlock).not.toContain("--background:");
    expect(css).toContain('.admin-theme[data-admin-theme="light"]');
    expect(css).toContain('.admin-theme[data-admin-theme="dark"]');
    expect(css).toContain("main.dark {");
    expect(css).not.toContain("@media (prefers-color-scheme");
    expect(source("app/layout.tsx")).not.toContain("AdminThemeProvider");
    expect(source("app/admin/layout.tsx")).not.toContain("AdminThemeProvider");
    expect(source("app/admin/login/page.tsx")).not.toContain("AdminThemeProvider");
  });
});
