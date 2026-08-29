"use client";

import { Chart, ArcElement, DoughnutController, Legend, Tooltip } from "chart.js";
import { useEffect, useRef } from "react";
import { useAdminTheme } from "@/components/admin/AdminThemeProvider";
import {
  REGISTRATION_MIX_COLORS,
  type RegistrationMixItem,
} from "@/lib/admin-dashboard-mix";

Chart.register(ArcElement, DoughnutController, Legend, Tooltip);

function cssTokenColor(
  styles: CSSStyleDeclaration,
  token: string,
  fallback: string,
): string {
  const value = styles.getPropertyValue(token).trim();
  if (!value) return fallback;
  return `hsl(${value})`;
}

export function AdminRegistrationMixChart({ items }: { items: readonly RegistrationMixItem[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useAdminTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !items.length) return;
    const styles = getComputedStyle(canvas);
    const dark = theme === "dark";
    const textColor = cssTokenColor(
      styles,
      "--muted-foreground",
      dark ? "hsl(215 16% 65%)" : "hsl(220 9% 46%)",
    );
    const surfaceColor = cssTokenColor(
      styles,
      "--card",
      dark ? "hsl(222 35% 11%)" : "hsl(0 0% 100%)",
    );
    const borderColor = cssTokenColor(
      styles,
      "--border",
      dark ? "hsl(217 20% 23%)" : "hsl(220 18% 88%)",
    );
    const headingColor = cssTokenColor(
      styles,
      "--card-foreground",
      dark ? "hsl(210 40% 98%)" : "hsl(222 47% 11%)",
    );
    const chart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: items.map((item) => item.label),
        datasets: [
          {
            data: items.map((item) => item.count),
            backgroundColor: items.map(
              (_, index) => REGISTRATION_MIX_COLORS[index % REGISTRATION_MIX_COLORS.length],
            ),
            borderColor: surfaceColor,
            borderWidth: 3,
            hoverOffset: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        animation: { duration: 250 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: surfaceColor,
            borderColor,
            borderWidth: 1,
            titleColor: headingColor,
            bodyColor: textColor,
            callbacks: {
              label(context) {
                const item = items[context.dataIndex];
                return ` ${item.count} paid (${item.percentage}%)`;
              },
            },
          },
        },
        color: textColor,
      },
    });
    return () => chart.destroy();
  }, [items, theme]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
