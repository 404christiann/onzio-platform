"use client";

import { useId } from "react";
import { RADAR_FLOOR, radarPoints, radarSummary, type RadarAxis } from "@/lib/admin-analytics-view";
import styles from "./player-chart.module.css";

// ADMIN-RE-19: the player's six-corner chart (design: cd-analytics-b). It lives
// outside components/admin/reimagined because that folder's contract allows no
// SVG: this is a chart, drawn from data, not an icon.

/**
 * The player's season as a shape: one corner for each number, each with its
 * own word and figure, reaching the edge where they are the team's best at it.
 * The words and figures are real text, so the chart reads without the picture.
 */
export function PlayerChart({ axes, name }: { axes: readonly RadarAxis[]; name: string }) {
  const gradient = `radar-${useId().replace(/:/g, "")}`;
  const count = axes.length;
  const shape = radarPoints(
    axes.map((a) => a.ratio),
    RADAR_FLOOR,
  );
  const edge = radarPoints(Array<number>(count).fill(1), 0);
  const ring = (scale: number) =>
    radarPoints(Array<number>(count).fill(scale), 0)
      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  const d = `M ${shape.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ")} Z`;

  return (
    <div
      className={styles.radar}
      role="group"
      aria-label={`${name}: ${radarSummary(axes)}`}
      data-testid="analytics-chart-player"
    >
      <svg viewBox="0 0 100 100" className={styles.radarGlow} aria-hidden="true" focusable="false">
        <path d={d} fill={`url(#${gradient})`} />
      </svg>
      <svg viewBox="0 0 100 100" className={styles.radarSvg} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={gradient} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" style={{ stopColor: "var(--ana-pop)", stopOpacity: 0.95 }} />
            <stop offset="45%" style={{ stopColor: "var(--ana-pop-mid)", stopOpacity: 0.7 }} />
            <stop offset="80%" style={{ stopColor: "var(--ana-pop-soft)", stopOpacity: 0.34 }} />
            <stop offset="100%" style={{ stopColor: "var(--ana-pop-faint)", stopOpacity: 0.14 }} />
          </radialGradient>
        </defs>
        {[1, 2 / 3].map((scale) => (
          <polygon key={scale} points={ring(scale)} className={styles.radarRing} />
        ))}
        <path d={d} fill={`url(#${gradient})`} className={styles.radarShape} />
        <path d={d} className={styles.radarLine} />
        {shape.map((p, index) => (
          <circle key={index} cx={p.x} cy={p.y} r={2.6} className={styles.radarDot} />
        ))}
      </svg>
      {axes.map((axis, index) => {
        const at = edge[index]!;
        const side = at.x < 45 ? "left" : at.x > 55 ? "right" : "middle";
        const level = at.y < 45 ? "top" : at.y > 55 ? "bottom" : "middle";
        return (
          <span
            key={axis.label}
            className={styles.radarLabel}
            data-side={side}
            data-level={level}
            style={{ left: `${at.x}%`, top: `${at.y}%` }}
          >
            <span className={styles.radarName}>{axis.label}</span>
            <span className={styles.radarValue}>{axis.text}</span>
          </span>
        );
      })}
    </div>
  );
}
