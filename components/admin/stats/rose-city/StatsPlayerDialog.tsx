"use client";

import { useId, useState, type RefObject } from "react";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { AdminDialog, AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { Button } from "@/components/ui/button";
import type { StatsPlayer } from "../types";
import { parseCount, seasonSplit, seasonTotalsProblem, statsFieldGroups, type StatsMode } from "./stats-model";
import type { SeasonGames } from "@/lib/season-totals-save";
import styles from "./rose-city-stats.module.css";

export type StatsPlayerDialogProps = {
  mode: StatsMode;
  player: StatsPlayer | null;
  open: boolean;
  /** The player's row in the page draft. Edits here stay in the dialog until Apply. */
  row: Record<string, number | boolean> | undefined;
  /** "2027-03-06 · vs Foothill United" in a match, "2027 season" in the totals. */
  context: string;
  games: SeasonGames | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Every edit goes to the page draft at once (the kit's "edits stay on the page until you press Save"); the page Save publishes. */
  onChange: (playerId: string, row: Record<string, number | boolean>) => void;
};

/** Mounted only while open, so every opening starts from the draft's row. The page returns focus to the Edit button on close. */
export function StatsPlayerDialog({ player, open, ...rest }: StatsPlayerDialogProps) {
  return player && open ? <DialogBody key={player.id} player={player} {...rest} /> : null;
}

function DialogBody({ mode, player, row, context, games, returnFocusRef, onClose, onChange }: Omit<StatsPlayerDialogProps, "open"> & { player: StatsPlayer }) {
  const idBase = useId();
  const groups = statsFieldGroups(mode, player);
  const fields = groups.flatMap(group => group.fields);
  const [started, setStarted] = useState(Boolean(row?.starts));
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(fields.filter(field => field.kind !== "boolean").map(field => [field.key, String(Number(row?.[field.key] ?? 0))])));
  const numbers = Object.fromEntries(fields.filter(field => field.kind !== "boolean").map(field => [field.key, parseCount(text[field.key] ?? "", field.max)]));
  const problem = mode === "season" ? seasonTotalsProblem(player, numbers, games) : null;

  /** Keep the saved row's own key order so an unchanged player stays unchanged. */
  function publish(nextText: Record<string, string>, nextStarted: boolean) {
    const next: Record<string, number | boolean> = {};
    for (const key of Object.keys(row ?? {})) {
      const field = fields.find(item => item.key === key);
      next[key] = key === "starts" && mode === "match" ? nextStarted : field ? parseCount(nextText[key] ?? "", field.max) : Number(row?.[key] ?? 0);
    }
    onChange(player.id, next);
  }

  return <AdminDialog open onClose={onClose} size="md" title={player.name} eyebrow={`#${player.number} · ${player.position}`} finalFocus={returnFocusRef}
    footer={<AdminDialogFooter primary={<Button type="button" data-primary="" onClick={onClose}>Done</Button>} />}>
    <div className={styles.dialogBody}>
    <p className={styles.context}>{context}{mode === "season" && " Totals are the match stats added up, plus anything added by hand."}</p>
    {groups.map(group => <fieldset key={group.id} className={styles.group}><legend>{group.label}</legend><div className={styles.grid}>
      {group.fields.map(field => {
        const id = `${idBase}-${field.key}`;
        if (field.kind === "boolean") return <div key={field.key} className={`${styles.field} ${styles.switchField}`}>
          <span><label htmlFor={id}>{field.label}</label>{field.hint && <p className={styles.hint}>{field.hint}</p>}</span>
          <AdminSwitch id={id} checked={started} label={`${player.name}: ${field.ariaLabel}`} onCheckedChange={value => { setStarted(value); publish(text, value); }} />
        </div>;
        const split = mode === "season" ? seasonSplit(player, field.key, numbers[field.key] ?? 0, games) : null;
        return <div key={field.key} className={styles.field}>
          <label htmlFor={id}>{field.label}</label>
          <input id={id} type="number" data-slot="stat-input" inputMode="numeric" min={0} max={field.max} step={1} aria-label={`${player.name}: ${field.ariaLabel}`}
            value={text[field.key] ?? "0"} onFocus={event => event.currentTarget.select()}
            onChange={event => { const nextText = { ...text, [field.key]: event.target.value }; setText(nextText); publish(nextText, started); }}
            onBlur={() => setText(previous => ({ ...previous, [field.key]: String(numbers[field.key] ?? 0) }))} />
          {split ? <span className={styles.split}>From matches {split.fromMatches} · added by hand {split.byHand > 0 ? "+" : ""}{split.byHand}</span>
            : field.hint && <span className={styles.hint}>{field.hint}</span>}
        </div>;
      })}
    </div></fieldset>)}
    {problem && <p className={styles.problem} role="alert">{problem}</p>}
    <p className={styles.dialogNote}>Edits stay on the page until you press Save.</p>
    </div>
  </AdminDialog>;
}
