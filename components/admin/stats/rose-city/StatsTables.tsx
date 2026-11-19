"use client";

import type { MouseEvent } from "react";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatsPlayer } from "../types";
import { cellText, splitPlayers, statsColumns, statsSummary, type StatsMode } from "./stats-model";
import styles from "./rose-city-stats.module.css";

type Props = {
  mode: StatsMode;
  players: readonly StatsPlayer[];
  values: Record<string, object>;
  dirtyIds: ReadonlySet<string>;
  disabled: boolean;
  onEdit: (playerId: string, event: MouseEvent<HTMLButtonElement>) => void;
};

/** The whole match (or season) as read-only tables, field players then goalkeepers. Edit opens that player's dialog. */
export function StatsTables({ mode, players, values, dirtyIds, disabled, onEdit }: Props) {
  const { field, keepers } = splitPlayers(players);
  const row = (player: StatsPlayer) => values[player.id] as Record<string, number | boolean> | undefined;
  const groups = [{ id: "field", title: "Field players", keeper: false, list: field }, { id: "keepers", title: "Goalkeepers", keeper: true, list: keepers }].filter(group => group.list.length);
  return <div className={styles.tables} data-stats-tables={mode}>
    {groups.map(group => {
      const columns = statsColumns(mode, group.keeper);
      return <div key={group.id} className={styles.card}>
        <div className={styles.scroll} role="region" aria-label={`${group.title} table`} tabIndex={0}>
          <table className={styles.table}>
            <caption>{group.title}</caption>
            <thead><tr>
              <th scope="col">#</th><th scope="col">Player</th>
              {columns.map(column => <th key={column.key} scope="col"><abbr title={column.label}>{column.abbr}<span className="sr-only"> ({column.label})</span></abbr></th>)}
              <th scope="col" className={styles.act}><span className="sr-only">Edit</span></th>
            </tr></thead>
            <tbody>
              {group.list.map(player => <tr key={player.id} data-player-id={player.id}>
                <td className={styles.number}>{player.number}</td>
                <td className={styles.name} title={player.name}>{player.name}{dirtyIds.has(player.id) && <span className={styles.dot} role="img" aria-label="Has unsaved changes" />}</td>
                {columns.map(column => { const value = row(player)?.[column.key]; return <td key={column.key} className={value ? undefined : styles.zero}>{cellText(mode, column.key, value)}</td>; })}
                <td className={styles.act}><button type="button" className={`admin-press ${styles.edit}`} aria-label={`Edit ${player.name}`} disabled={disabled} data-edit-player={player.id} onClick={event => onEdit(player.id, event)}>Edit</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <ul className={styles.list} aria-label={`${group.title} list`}>
          <li><h3 className={styles.groupHead}>{group.title}</h3></li>
          {group.list.map(player => <li key={player.id} className={styles.item} data-player-id={player.id}>
            <span className={styles.number} aria-hidden="true">{player.number}</span>
            <span style={{ minInlineSize: 0 }}><b>{player.name}{dirtyIds.has(player.id) && <span className={styles.dot} role="img" aria-label="Has unsaved changes" />}</b><small>{statsSummary(mode, player, row(player))}</small></span>
            <button type="button" className={`admin-press ${styles.edit}`} aria-label={`Edit ${player.name}`} disabled={disabled} onClick={event => onEdit(player.id, event)}>Edit</button>
          </li>)}
        </ul>
      </div>;
    })}
  </div>;
}

/** Loading placeholder shaped like the tables: a heading line and a run of player rows. */
export function StatsTablesSkeleton({ label, rows = 8 }: { label: string; rows?: number }) {
  return <AdminSkeletonRegion label={label}>
    <div className={styles.card} style={{ padding: 12 }}>
      {Array.from({ length: rows }, (_, index) => <div key={index} style={{ display: "flex", gap: 12, margin: "12px 0" }}>
        <Skeleton className="h-4 w-6" /><Skeleton className="h-4 w-40" /><Skeleton className="h-4 flex-1" />
      </div>)}
    </div>
  </AdminSkeletonRegion>;
}
