import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/admin/(protected)/analytics/page.tsx"),
  "utf8",
);

describe("protected admin analytics presentation", () => {
  it("preserves every existing visualization on Chart.js and accessible SVG", () => {
    expect(source).toContain("Chart.register(...registerables)");
    expect(source).toContain('type: "bar"');
    expect(source).toContain('type: "line"');
    expect(source).toContain("function RadarCard(");
    expect(source).toContain(
      'aria-label="Radar chart showing player profile vs position average"',
    );
    expect(source).not.toMatch(/from ["'](?:recharts|d3|@nivo|echarts|plotly)/);
  });

  it("re-resolves protected CSS tokens for both charts on explicit theme changes", () => {
    expect(source).toContain(
      'import { useAdminTheme } from "@/components/admin/AdminThemeProvider";',
    );
    expect(source.match(/const \{ theme \} = useAdminTheme\(\);/g)).toHaveLength(
      2,
    );
    expect(
      source.match(/resolveChartTheme\(canvasRef\.current, theme\)/g),
    ).toHaveLength(2);
    expect(source).toContain("}, [data, theme]);");
    expect(source).toContain("}, [data, loading, metric, theme]);");
    for (const token of [
      "--primary",
      "--muted-foreground",
      "--border",
      "--card",
      "--card-foreground",
    ]) {
      expect(source).toContain(`"${token}"`);
    }
    expect(source).not.toContain("CHART_THEME");
    expect(source).not.toContain("CHART_AXES");
  });

  it("destroys and releases each exact Chart.js instance", () => {
    expect(source.match(/chart\.destroy\(\);/g)).toHaveLength(2);
    expect(
      source.match(
        /if \(chartRef\.current === chart\) chartRef\.current = null;/g,
      ),
    ).toHaveLength(2);
  });

  it("uses the shared restrained admin page system and keeps filters accessible", () => {
    expect(source).toContain("<AdminPage>");
    expect(source).toContain("<AdminPageHeader");
    expect(source).toContain("<AdminPageToolbar>");
    expect(source).toContain('aria-label="Filter players by position"');
    expect(source).toContain("aria-pressed={posFilter === position}");
    expect(source).toContain("aria-pressed={active}");
  });
});
