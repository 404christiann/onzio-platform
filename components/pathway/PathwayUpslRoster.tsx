"use client";

import { useState } from "react";
import NationalityFlag from "@/components/NationalityFlag";
import ResilientImage from "@/components/ResilientImage";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import PathwayImageFallback from "@/components/pathway/PathwayImageFallback";
import { imageDeliveryProps } from "@/lib/image-delivery";

export type PathwayRosterPosition = "GK" | "DF" | "MF" | "FW";

export type PathwayRosterPlayer = {
  id: string;
  name: string;
  position: PathwayRosterPosition;
  squadNumber: number;
  nationality: string;
};

export type PathwayRosterStaffMember = {
  id: string;
  name: string;
  role: string;
  nationality: string;
  /**
   * Optional seeded monogram for the staff card's initials badge. The
   * reference composition reads a stored `initials` column; Pathway's default
   * roster carries no such field, so the card derives one from the name when
   * it is absent.
   */
  initials?: string;
};

export type PathwayUpslRosterProps = {
  players: PathwayRosterPlayer[];
  staff: PathwayRosterStaffMember[];
};

type RosterFilter = "all" | PathwayRosterPosition | "staff";

/** "Marcus Hale" -> "MH", mirroring the reference staff card's stored monogram. */
function staffInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 3) || "?"
  );
}

const rosterGroups: Array<{
  position: PathwayRosterPosition;
  label: string;
  singular: string;
}> = [
  { position: "GK", label: "Goalkeepers", singular: "Goalkeeper" },
  { position: "DF", label: "Defenders", singular: "Defender" },
  { position: "MF", label: "Midfielders", singular: "Midfielder" },
  { position: "FW", label: "Forwards", singular: "Forward" },
];

/**
 * Pathway's UPSL roster keeps the accepted Lions page hierarchy and the
 * supplied Diverse City card composition while remaining tenant-neutral.
 * Phase 1 intentionally carries placeholder names and the tenant crest instead
 * of inventing biographies, statistics or player photography. Cards are
 * informational and never link to unavailable profiles.
 */
export default function PathwayUpslRoster({
  players,
  staff,
}: PathwayUpslRosterProps) {
  const { clubLogoUrl } = useClubBranding();
  const crestUrl = clubLogoUrl || "/club-logo";
  const [filter, setFilter] = useState<RosterFilter>("all");
  const visibleGroups =
    filter === "all"
      ? rosterGroups
      : rosterGroups.filter((group) => group.position === filter);
  const showStaff = filter === "all" || filter === "staff";
  const resultLabel =
    filter === "all"
      ? "all squad and technical staff"
      : filter === "staff"
        ? "technical staff"
        : rosterGroups.find((group) => group.position === filter)?.label ??
          "squad";
  const crestFallback = (
    <PathwayImageFallback label="Club crest unavailable" />
  );

  return (
    <main className="pathway-roster-page">
      <header className="pathway-roster-filter-bar">
        <div>
          <span>UPSL</span>
          <h1>Roster</h1>
        </div>
        <div className="pathway-roster-filter-control">
          <label htmlFor="pathway-roster-filter">Filter roster</label>
          <select
            id="pathway-roster-filter"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as RosterFilter)
            }
          >
            <option value="all">All squad</option>
            {rosterGroups.map((group) => (
              <option value={group.position} key={group.position}>
                {group.label}
              </option>
            ))}
            <option value="staff">Technical staff</option>
          </select>
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        Showing {resultLabel}
      </p>
      <div
        className="pathway-roster-content"
        aria-label={`Showing ${resultLabel}`}
      >
        {visibleGroups.map((rosterGroup) => {
          const groupPlayers = players.filter(
            (player) => player.position === rosterGroup.position,
          );

          return (
            <section
              className="pathway-roster-group"
              id={`pathway-roster-${rosterGroup.position.toLowerCase()}`}
              key={rosterGroup.position}
            >
              <div className="pathway-roster-group-heading">
                <h2>{rosterGroup.label}</h2>
                <span>
                  {groupPlayers.length}{" "}
                  {groupPlayers.length === 1 ? "player" : "players"}
                </span>
              </div>
              <div className="pathway-roster-grid">
                {groupPlayers.map((player) => (
                  <article
                    className="pathway-roster-card"
                    data-interactive="false"
                    data-pathway-roster-player-card="true"
                    key={player.id}
                  >
                    <div className="pathway-roster-card-media">
                      <ResilientImage
                        src={crestUrl}
                        alt=""
                        fill
                        sizes="(max-width: 800px) 50vw, (max-width: 1050px) 33vw, 25vw"
                        fallback={crestFallback}
                        {...imageDeliveryProps("club-logo")}
                      />
                    </div>
                    <div className="pathway-roster-card-copy">
                      <div className="pathway-roster-card-headline">
                        <span
                          className="pathway-roster-card-number"
                          aria-hidden="true"
                        >
                          {player.squadNumber}
                        </span>
                        <NationalityFlag
                          nationality={player.nationality}
                          className="pathway-roster-card-flag"
                        />
                      </div>
                      <strong className="pathway-roster-card-name">
                        {player.name}
                      </strong>
                      <span className="pathway-roster-card-position">
                        {rosterGroup.singular}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        {showStaff && (
          <section className="pathway-roster-group" id="pathway-roster-staff">
            <div className="pathway-roster-group-heading">
              <h2>Technical Staff</h2>
              <span>{staff.length} staff</span>
            </div>
            <div className="pathway-roster-grid pathway-roster-staff-grid">
              {staff.map((member) => (
                <article
                  className="pathway-roster-card pathway-roster-staff-card"
                  data-interactive="false"
                  data-pathway-roster-staff-card="true"
                  key={member.id}
                >
                  <div className="pathway-roster-card-media">
                    <ResilientImage
                      src={crestUrl}
                      alt=""
                      fill
                      sizes="(max-width: 800px) 50vw, (max-width: 1050px) 33vw, 25vw"
                      fallback={crestFallback}
                      {...imageDeliveryProps("club-logo")}
                    />
                  </div>
                  <div className="pathway-roster-card-copy">
                    <div className="pathway-roster-card-headline">
                      <strong className="pathway-roster-card-name">
                        {member.name}
                      </strong>
                      <NationalityFlag
                        nationality={member.nationality}
                        className="pathway-roster-card-flag"
                      />
                    </div>
                    <div className="pathway-roster-card-staff-role">
                      <span
                        className="pathway-roster-card-staff-initials"
                        aria-hidden="true"
                      >
                        {member.initials || staffInitials(member.name)}
                      </span>
                      <span className="pathway-roster-card-staff-title">
                        {member.role}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
