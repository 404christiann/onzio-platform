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

  it("ADMIN-WARN: light warnings are yellow fills with readable dark-gold text; dark is unchanged", () => {
    const css = source("styles/globals.css");
    const block = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start, selector).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf("\n}", start));
    };
    const token = (text: string, name: string) => {
      const match = text.match(new RegExp(`--${name}: (\\d+) (\\d+)% (\\d+)%;`));
      expect(match, name).not.toBeNull();
      return match!.slice(1).map(Number) as [number, number, number];
    };
    const luminance = ([h, s, l]: [number, number, number]) => {
      const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
      const channel = (n: number) => {
        const k = (n + h / 30) % 12;
        const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
    };
    const contrast = (a: [number, number, number], b: [number, number, number]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const white: [number, number, number] = [0, 0, 100];

    const light = block('.admin-theme[data-admin-theme="light"],\n.admin-theme[data-admin-theme="light"] > .dark');
    const warning = token(light, "warning");
    expect(warning[0]).toBeGreaterThanOrEqual(45);
    expect(warning[0]).toBeLessThanOrEqual(60);
    expect(warning[2]).toBeGreaterThanOrEqual(50);
    expect(contrast(token(light, "warning-foreground"), warning)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(light, "warning-ink"), white)).toBeGreaterThanOrEqual(4.5);
    expect(block('.admin-theme[data-admin-theme="light"] .admin-portal')).not.toContain("--warning");

    const dark = block('.admin-theme[data-admin-theme="dark"],\n.admin-theme[data-admin-theme="dark"] > .dark,\n.admin-theme .dark,\nmain.dark');
    expect(token(dark, "warning")).toEqual([41, 96, 58]);
    expect(token(dark, "warning-foreground")).toEqual([222, 47, 11]);
    expect(token(dark, "warning-ink")).toEqual([41, 96, 58]);
  });
});
