"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import EditorialPlayerCard from "@/components/editorial/EditorialPlayerCard";
import EditorialStaffCard from "@/components/editorial/EditorialStaffCard";
import type { Player, Staff } from "@/lib/data";

/**
 * Presentational editorial roster view, ported from the approved concept
 * mockup (soccerplatformmockups src/components/public/RosterScreen.tsx).
 *
 * The caller (`EditorialRoster`) supplies the already-fetched, grouped
 * roster and staff list as props, so this component stays independently
 * testable without mocking Supabase — the same convention `EditorialHome`'s
 * sections established in L4.
 *
 * Starter tier: opens directly with a compact right-aligned filter control —
 * no roster hero or introductory marketing copy. Position groups render in
 * Goalkeepers -> Defenders -> Midfielders -> Forwards order, each with a
 * player count, followed by a separate "Technical staff" section (anchor
 * `#staff`, matching the `/staff` redirect target). Cards are entirely
 * non-interactive (`EditorialPlayerCard`/`EditorialStaffCard` render
 * `data-interactive="false"`): no stats, no click affordance, no profile
 * modal — that's Pro/future scope.
 *
 * Filter changes use a Framer Motion exit/reveal sequence with synchronized
 * card rows and a `prefers-reduced-motion` fallback, exactly matching the
 * mockup's own dual-animation-system approach: `EditorialMotion`'s GSAP
 * ScrollTrigger layer (untouched — its `section:not(.hero)` reveal and
 * `.player-card`/`.staff-card` stagger selectors already matched this
 * markup as a safe no-op since L3) still owns the one-time scroll-into-view
 * reveal, while Framer Motion here owns the filter-change transition.
 */

export type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
export type RosterFilter = "all" | Position | "staff";

export type RosterData = {
  goalkeepers: Player[];
  defenders: Player[];
  midfielders: Player[];
  forwards: Player[];
};

export const EMPTY_ROSTER: RosterData = {
  goalkeepers: [],
  defenders: [],
  midfielders: [],
  forwards: [],
};

export const GROUPS: Array<[Position, string, string]> = [
  ["Goalkeeper", "Goalkeepers", "goalkeepers"],
  ["Defender", "Defenders", "defenders"],
  ["Midfielder", "Midfielders", "midfielders"],
  ["Forward", "Forwards", "forwards"],
];

export function playersByPosition(roster: RosterData, position: Position): Player[] {
  switch (position) {
    case "Goalkeeper":
      return roster.goalkeepers;
    case "Defender":
      return roster.defenders;
    case "Midfielder":
      return roster.midfielders;
    case "Forward":
      return roster.forwards;
  }
}

export default function EditorialRosterView({
  roster,
  staffList,
  crestUrl,
}: {
  roster: RosterData;
  staffList: Staff[];
  crestUrl: string;
}) {
  const [filter, setFilter] = useState<RosterFilter>("all");
  const prefersReducedMotion = useReducedMotion();

  const visibleGroups = GROUPS.filter(
    ([position]) => filter === "all" || filter === position,
  );
  const resultLabel =
    filter === "all"
      ? "All squad"
      : filter === "staff"
        ? "Technical staff"
        : (GROUPS.find(([position]) => position === filter)?.[1] ?? "Squad");

  return (
    <div className="roster-page">
      <div className="roster-filter-bar">
        <label htmlFor="roster-filter">Filter roster</label>
        <select
          id="roster-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as RosterFilter)}
        >
          <option value="all">All squad</option>
          {GROUPS.map(([position, label]) => (
            <option value={position} key={position}>
              {label}
            </option>
          ))}
          <option value="staff">Technical staff</option>
        </select>
      </div>

      <div className="roster-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            className="roster-filter-results"
            key={filter}
            aria-label={`Showing ${resultLabel}`}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 18, clipPath: "inset(0 0 7% 0)" }
            }
            animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -10, clipPath: "inset(0 0 5% 0)" }
            }
            transition={{
              duration: prefersReducedMotion ? 0.12 : 0.42,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {!prefersReducedMotion && (
              <motion.span
                className="roster-filter-flash"
                aria-hidden
                initial={{ scaleX: 0, opacity: 1 }}
                animate={{ scaleX: 1, opacity: 0 }}
                transition={{
                  scaleX: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
                  opacity: { delay: 0.3, duration: 0.18 },
                }}
              />
            )}

            {visibleGroups.map(([position, label, anchor], groupIndex) => {
              const group = playersByPosition(roster, position);
              return (
                <motion.section
                  className="roster-group"
                  id={anchor}
                  key={position}
                  initial={
                    prefersReducedMotion ? false : { opacity: 0, y: 12 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.38,
                    delay: groupIndex * 0.06,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <div className="roster-group-heading">
                    <h2>{label}</h2>
                    <small>
                      {group.length} {group.length === 1 ? "player" : "players"}
                    </small>
                  </div>
                  <div className="roster-grid">
                    {group.map((player) => (
                      <motion.div
                        className="roster-filter-card"
                        key={player.id ?? player.number}
                        initial={
                          prefersReducedMotion
                            ? false
                            : { opacity: 0, y: 28, scale: 0.975 }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          duration: 0.5,
                          delay: 0.08,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <EditorialPlayerCard player={player} crestUrl={crestUrl} />
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              );
            })}

            {(filter === "all" || filter === "staff") && (
              <motion.section
                className="staff-section"
                id="staff"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.42,
                  delay: visibleGroups.length * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="staff-section-intro">
                  <h2>
                    Technical
                    <br />
                    <em>staff.</em>
                  </h2>
                </div>
                <div className="staff-grid">
                  {staffList.map((member) => (
                    <motion.div
                      className="roster-filter-card"
                      key={member.name}
                      initial={
                        prefersReducedMotion
                          ? false
                          : { opacity: 0, y: 28, scale: 0.975 }
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: 0.5,
                        delay: 0.1,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <EditorialStaffCard member={member} crestUrl={crestUrl} />
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
