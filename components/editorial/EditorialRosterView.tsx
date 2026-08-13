"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import EditorialPlayerCard from "@/components/editorial/EditorialPlayerCard";
import EditorialStaffCard from "@/components/editorial/EditorialStaffCard";
import {
  EMPTY_ROSTER,
  GROUPS,
  playersByPosition,
  resultLabelForFilter,
  showsStaffSection,
  visibleGroupsForFilter,
  type Position,
  type RosterData,
  type RosterFilter,
} from "@/lib/editorial-roster";
import type { Staff } from "@/lib/data";

export { EMPTY_ROSTER, GROUPS, playersByPosition, resultLabelForFilter, showsStaffSection, visibleGroupsForFilter };
export type { Position, RosterData, RosterFilter };

/**
 * Presentational editorial roster view, ported (visual design) from the
 * approved concept mockup via the superseded claude/lions-fc-website-setup-
 * ij0p7t reference branch's EditorialRosterView.tsx.
 *
 * The caller (EditorialRoster) supplies the already-fetched, grouped roster
 * and staff list as props, so this component stays independently testable
 * without mocking Supabase -- the same convention EditorialHome's sections
 * established in E3.
 *
 * Starter tier: opens directly with a compact right-aligned filter control --
 * no roster hero or introductory marketing copy. Position groups render in
 * Goalkeepers -> Defenders -> Midfielders -> Forwards order, each with a
 * player count, followed by a separate "Technical staff" section (anchor
 * `#staff`, matching /staff's redirect target). Cards are entirely
 * non-interactive (EditorialPlayerCard/EditorialStaffCard render
 * `data-interactive="false"`): no stats, no click affordance, no profile
 * modal -- that's Pro/future scope.
 *
 * Filter changes use a Motion exit/reveal sequence with synchronized card
 * rows and a prefers-reduced-motion fallback, exactly matching the mockup's
 * own dual-animation-system approach: EditorialMotion's GSAP ScrollTrigger
 * layer (untouched -- its `section:not(.hero)` reveal and `.player-card`/
 * `.staff-card` stagger selectors already match this markup, see the
 * CARD_SELECTOR list in EditorialMotion.tsx) still owns the one-time
 * scroll-into-view reveal, while Motion here owns the filter-change
 * transition. Imports from "motion/react" (this repo's real installed
 * package, already used by components/ui/sliding-panel.tsx and
 * components/admin/payments/PaymentStatusCard.tsx) rather than
 * "framer-motion" -- the reference branch's import path -- since
 * "framer-motion" is not a direct dependency here.
 *
 * The RosterFilter/RosterData types, GROUPS, and the pure filter-logic
 * functions (playersByPosition/visibleGroupsForFilter/showsStaffSection/
 * resultLabelForFilter) live in lib/editorial-roster.ts (a plain, non-JSX
 * module), not here, so contract tests can exercise them directly -- this
 * repo's vitest.config.ts has no JSX-transform plugin, so a .tsx file's
 * named exports cannot be dynamically imported in tests. Re-exported below
 * for callers that only need to import this one module.
 */

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

  const visibleGroups = visibleGroupsForFilter(filter);
  const resultLabel = resultLabelForFilter(filter);

  return (
    <div className="roster-page bg-ed-paper px-5 pb-28 pt-32 text-ed-ink md:px-8">
      <div className="roster-filter-bar mx-auto mb-10 flex max-w-[1180px] flex-wrap items-center justify-between gap-4 border-b border-[color:var(--ed-line)] pb-6">
        <label htmlFor="roster-filter">Filter roster</label>
        <select
          className="min-h-12 border border-[color:var(--ed-line-strong)] bg-transparent px-4 font-display text-xs font-black uppercase tracking-[0.14em] text-ed-ink"
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

      <div className="roster-content mx-auto max-w-[1180px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            className="roster-filter-results relative grid gap-14"
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
            {/*
              Always mounted (never conditionally included by
              prefersReducedMotion) so the element tree shape is identical
              between the server render (where useReducedMotion always
              returns null) and a real reduced-motion client -- omitting it
              structurally on the client only produces a genuine hydration
              mismatch (found during the reference branch's manual
              verification, see its HANDOFF). Reduced motion is instead
              expressed only through prop *values*: the flash stays
              permanently transparent and never animates.
            */}
            <motion.span
              className="roster-filter-flash pointer-events-none absolute inset-x-0 top-0 h-1 origin-left bg-ed-accent"
              aria-hidden
              initial={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { scaleX: 0, opacity: 1 }
              }
              animate={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { scaleX: 1, opacity: 0 }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : {
                      scaleX: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
                      opacity: { delay: 0.3, duration: 0.18 },
                    }
              }
            />

            {visibleGroups.map(([position, label, anchor], groupIndex) => {
              const group = playersByPosition(roster, position);
              return (
                <motion.section
                  className="roster-group grid gap-8"
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
                  <div className="roster-group-heading flex flex-wrap items-end justify-between gap-4">
                    <h2 className="font-display text-[clamp(3rem,9vw,7rem)] font-black uppercase leading-[0.82]">{label}</h2>
                    <small className="font-display text-xs font-black uppercase tracking-[0.16em] text-ed-muted">
                      {group.length} {group.length === 1 ? "player" : "players"}
                    </small>
                  </div>
                  <div className="roster-grid grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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

            {showsStaffSection(filter) && (
              <motion.section
                className="staff-section grid gap-8"
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
                  <h2 className="font-display text-[clamp(3rem,9vw,7rem)] font-black uppercase leading-[0.82]">
                    Technical
                    <br />
                    <em className="not-italic text-ed-accent">staff.</em>
                  </h2>
                </div>
                <div className="staff-grid grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
