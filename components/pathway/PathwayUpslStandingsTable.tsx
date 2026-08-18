import ResilientImage from "@/components/ResilientImage";
import type {
  DBLeagueStandingRow,
  DBLeagueStandingsSettings,
} from "@/lib/db-types";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { teamAbbreviation } from "@/lib/standings-content";

type StandingColumn = {
  key: "played" | "wins" | "draws" | "losses" | "goal_difference" | "points";
  label: string;
};

const COLUMNS: StandingColumn[] = [
  { key: "played", label: "GP" },
  { key: "wins", label: "W" },
  { key: "draws", label: "D" },
  { key: "losses", label: "L" },
  { key: "goal_difference", label: "GD" },
  { key: "points", label: "PTS" },
];

export type PathwayUpslStandingsTableProps = {
  settings: DBLeagueStandingsSettings;
  rows: DBLeagueStandingRow[];
  clubCrest?: { src: string };
};

function formatDifference(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * The pathway presentation of the shared UPSL Ohio Valley table. Data stays
 * tenant-owned; this mirrors the accepted Lions table geometry without
 * importing editorial@1 identity context or styles into pathway@1.
 */
export default function PathwayUpslStandingsTable({
  settings,
  rows,
  clubCrest,
}: PathwayUpslStandingsTableProps) {
  const orderedRows = [...rows].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  if (orderedRows.length === 0) return null;

  return (
    <section
      className="pathway-upsl-standings"
      aria-labelledby="pathway-upsl-standings-heading"
    >
      <div className="pathway-upsl-standings-inner">
        {settings.eyebrow ? (
          <p className="pathway-upsl-standings-eyebrow">
            {settings.eyebrow}
          </p>
        ) : null}
        <h2 id="pathway-upsl-standings-heading">{settings.title}</h2>
        {settings.intro ? (
          <p className="pathway-upsl-standings-intro">{settings.intro}</p>
        ) : null}

        <div
          className="pathway-upsl-standings-card"
          role="table"
          aria-label={`${settings.title} league standings`}
        >
          <div
            className="pathway-upsl-standings-row pathway-upsl-standings-row-head"
            role="row"
          >
            <div className="pathway-upsl-standings-team-head" role="columnheader">
              <span>#</span>
              <span>Team</span>
            </div>
            {COLUMNS.map((column) => (
              <span key={column.key} role="columnheader">
                {column.label}
              </span>
            ))}
          </div>

          {orderedRows.map((row, index) => {
            const logoSrc = row.is_club ? clubCrest?.src : row.logo_url;
            const abbreviation =
              row.team_abbreviation || teamAbbreviation(row.team_name);
            const logoFallback = (
              <span
                className="pathway-upsl-standings-abbr pathway-upsl-standings-logo-fallback"
                aria-hidden="true"
              >
                {abbreviation}
              </span>
            );

            return (
              <div
                className="pathway-upsl-standings-row"
                data-club={row.is_club ? "true" : "false"}
                key={row.id}
                role="row"
              >
                <div className="pathway-upsl-standings-team" role="cell">
                  <span className="pathway-upsl-standings-rank">
                    {index + 1}
                  </span>
                  {logoSrc ? (
                    <span className="pathway-upsl-standings-crest">
                      <ResilientImage
                        src={logoSrc}
                        alt=""
                        fill
                        sizes="38px"
                        className="pathway-upsl-standings-crest-img"
                        fallback={logoFallback}
                        {...imageDeliveryProps(
                          row.is_club ? "club-logo" : "opponent-crest",
                        )}
                      />
                    </span>
                  ) : (
                    <span
                      className="pathway-upsl-standings-abbr"
                      aria-hidden="true"
                    >
                      {abbreviation}
                    </span>
                  )}
                  <strong>{row.team_name}</strong>
                </div>
                {COLUMNS.map((column) => (
                  <span
                    className="pathway-upsl-standings-stat"
                    key={column.key}
                    role="cell"
                  >
                    {column.key === "goal_difference"
                      ? formatDifference(row[column.key])
                      : row[column.key]}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
