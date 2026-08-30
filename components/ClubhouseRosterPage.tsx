"use client";

import Image from "@/components/ResilientImage";
import { useEffect, useMemo, useState } from "react";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { useClubId } from "@/components/ClubContextProvider";
import NationalityFlag from "@/components/NationalityFlag";
import { fetchRoster, fetchStaff } from "@/lib/queries";
import type { Player, Staff } from "@/lib/data";

type RosterData = Awaited<ReturnType<typeof fetchRoster>>;
type RosterFilter = "all" | "GK" | "DF" | "MF" | "FW" | "staff";

type SquadGroup = {
  label: string;
  shortLabel: string;
  filter: Exclude<RosterFilter, "all" | "staff">;
  players: Player[];
};

function totalPlayers(roster: RosterData | null): number {
  if (!roster) return 0;
  return (
    roster.goalkeepers.length +
    roster.defenders.length +
    roster.midfielders.length +
    roster.forwards.length
  );
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: "", last: parts[0] ?? name };
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts[parts.length - 1] ?? "",
  };
}

function formatNumber(number: number | string) {
  const parsed = Number(number);
  if (!Number.isFinite(parsed)) return String(number);
  return String(parsed).padStart(2, "0");
}

function PlayerTile({
  player,
  crestUrl,
}: {
  player: Player;
  crestUrl: string;
}) {
  const { first, last } = splitName(player.name);
  return (
    <article
      className="player-card"
      data-interactive="false"
      data-clubhouse-roster-player-card="true"
    >
      <span className="player-card-number" aria-hidden="true">
        {player.number}
      </span>
      <span className="player-card-media">
        <Image
          src={crestUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1050px) 33vw, 25vw"
          className="is-crest"
        />
      </span>
      <span className="player-card-identity">
        <span className="player-card-topline">
          <strong>{formatNumber(player.number)}</strong>
          <span className="player-card-meta">
            <small>{player.position}</small>
            <NationalityFlag
              nationality={player.nationality}
              width={30}
              className="player-card-flag"
            />
          </span>
        </span>
        <span className="player-card-name">
          {first && <small>{first}</small>}
          <strong>{last || player.name}</strong>
        </span>
      </span>
    </article>
  );
}

function StaffTile({ member, crestUrl }: { member: Staff; crestUrl: string }) {
  return (
    <article className="staff-card" data-interactive="false">
      <span className="staff-card-media">
        <Image
          src={crestUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1050px) 33vw, 25vw"
          className="is-crest"
        />
      </span>
      <span className="staff-card-copy">
        <span className="staff-card-name-row">
          <span className="staff-card-name">{member.name}</span>
          <NationalityFlag
            nationality={member.nationality}
            width={30}
            className="staff-card-flag"
          />
        </span>
        <span className="staff-card-role">
          <b>{member.initials}</b>
          {member.role}
        </span>
      </span>
    </article>
  );
}

export default function ClubhouseRosterPage() {
  const clubId = useClubId();
  const { clubLogoUrl } = useClubBranding();
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchRoster(undefined, clubId), fetchStaff(clubId)])
      .then(([nextRoster, nextStaff]) => {
        if (cancelled) return;
        setRoster(nextRoster);
        setStaff(nextStaff);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load roster.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const groups = useMemo<SquadGroup[]>(
    () =>
      roster
        ? [
            { label: "Goalkeepers", shortLabel: "GK", filter: "GK", players: roster.goalkeepers },
            { label: "Defenders", shortLabel: "DF", filter: "DF", players: roster.defenders },
            { label: "Midfielders", shortLabel: "MF", filter: "MF", players: roster.midfielders },
            { label: "Forwards", shortLabel: "FW", filter: "FW", players: roster.forwards },
          ]
        : [],
    [roster],
  );
  const visibleGroups = groups.filter((group) => filter === "all" || filter === group.filter);
  const showStaff = filter === "all" || filter === "staff";
  const filterLabel = {
    all: "All squad",
    GK: "Goalkeepers",
    DF: "Defenders",
    MF: "Midfielders",
    FW: "Forwards",
    staff: "Technical staff",
  }[filter];
  const crestUrl = clubLogoUrl || "/club-logo";

  return (
    <div className="clubhouse-route-page roster-page">
      <div className="roster-filter-bar">
        <label htmlFor="roster-filter">Filter roster</label>
        <select
          id="roster-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as RosterFilter)}
        >
          <option value="all">All squad</option>
          <option value="GK">Goalkeepers</option>
          <option value="DF">Defenders</option>
          <option value="MF">Midfielders</option>
          <option value="FW">Forwards</option>
          <option value="staff">Technical staff</option>
        </select>
      </div>

      <section className="roster-content">
        {loading && <div className="clubhouse-route-state">Loading squad</div>}
        {error && !loading && <div className="clubhouse-route-state">{error}</div>}
        {!loading && !error && roster && (
          <div className="roster-filter-results" aria-label={`Showing ${filterLabel}`}>
            <span className="roster-filter-flash" aria-hidden="true" />
            {visibleGroups.map((group) => (
              <section key={group.label} className="roster-group" id={group.label.toLowerCase()}>
                <div className="roster-group-heading">
                  <h2>{group.label}</h2>
                  <small>
                    {group.players.length} {group.players.length === 1 ? "player" : "players"}
                  </small>
                </div>
                <div className="roster-grid">
                  {group.players.map((player) => (
                    <div key={player.id ?? player.number} className="roster-filter-card">
                      <PlayerTile player={player} crestUrl={crestUrl} />
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {showStaff && (
              <section className="staff-section" id="staff">
                <div className="staff-section-intro">
                  <h2>
                    Technical
                    <br />
                    <em>Staff.</em>
                  </h2>
                </div>
                <div className="staff-grid">
                  {staff.map((member) => (
                    <div key={member.name} className="roster-filter-card">
                      <StaffTile member={member} crestUrl={crestUrl} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
