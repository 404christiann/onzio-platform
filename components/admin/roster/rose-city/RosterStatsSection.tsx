"use client";

import { IconCaretDown } from "@/components/admin/icons";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { ShimmerRegion } from "@/components/admin/ui/Shimmer";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { editTargetProps } from "@/lib/admin-edit-targets";
import { statField, rosterTarget } from "./roster-edit-targets";
import { FIELD_STAT_FIELDS, KEEPER_STAT_FIELDS } from "./rose-city-roster-model";
import type { RosterSeasonStats } from "./useRosterSeasonStats";
import styles from "./rose-city-roster.module.css";

export function RosterStatsSection({ playerId, keeper, state }: { playerId: string; keeper: boolean; state: RosterSeasonStats }) {
  const fields = keeper ? KEEPER_STAT_FIELDS : FIELD_STAT_FIELDS;
  return (
    <div className={styles.fields}>
      <p className={styles.help} style={{ margin: 0 }}>Season totals. They add up from match stats; change a total to add the rest by hand. Saved with this player.</p>
      <div className={styles.field}>
        <label htmlFor="roster-stats-season" className={styles.label}>Season</label>
        <NativeSelect chevronIcon={IconCaretDown} id="roster-stats-season" aria-label="Player season stats season" value={state.selectedId}
          disabled={state.loading} onChange={event => void state.changeSeason(event.target.value)}>
          {state.seasons.map(season => <NativeSelectOption key={season.id} value={season.id}>{season.label}{season.active ? " (Active)" : ""}</NativeSelectOption>)}
        </NativeSelect>
      </div>
      {state.error && <p role="alert" className={styles.alert} style={{ margin: 0 }}>{state.error}</p>}
      <div className={styles.statsSlot} data-field-count={fields.length}>
        <ShimmerRegion loading={state.loading} minHeight={200} loadingLabel="Loading season stats"
          skeleton={<div className={styles.stats2} inert aria-hidden="true">{fields.map(([key]) => <div key={key} className={ADMIN_INPUT_CLASS} style={{ opacity: 0.4 }} />)}</div>}>
          <div className={styles.stats2}>
            {fields.map(([key, label]) => (
              <div key={key} className={styles.field} {...editTargetProps(rosterTarget(playerId, statField(key)))}>
                <label htmlFor={`roster-stat-${key}`} className={styles.label}>{label}</label>
                <input id={`roster-stat-${key}`} type="number" min={0} value={String(state.stats[key] ?? 0)} className={ADMIN_INPUT_CLASS}
                  onChange={event => state.setStat(key, Number(event.target.value))} />
              </div>
            ))}
          </div>
        </ShimmerRegion>
      </div>
    </div>
  );
}
