"use client";

// RC2027-MATCH-SUMMARY: Schedule editor fields for Sam's Match Summary page (cinematic@2 only).
import { useState } from "react";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import {
  MATCH_SUMMARY_LIMITS, STANDARD_MATCH_STAT_LABELS, formatPeopleLines, formatStaffLines, parsePeopleLines, parseStaffLines,
  type MatchEvent, type MatchLineup, type MatchSummary,
} from "@/lib/match-summary";

const KIND_LABELS: Record<MatchEvent["kind"], string> = { goal: "Goal", yellow: "Yellow card", red: "Red card", sub: "Substitution" };
const OFFICIAL_ROLES = ["Referee", "Asst. Referee 1", "Asst. Referee 2", "Fourth official", "VAR"];
const KIT_ITEMS = ["Jersey", "Shorts", "Socks"];
const button = "min-h-11 rounded-lg border border-border px-3 text-sm font-semibold";

function Group({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return <fieldset className="space-y-3 rounded-xl border border-border p-3 sm:p-4">
    <legend className="px-1 font-body text-sm font-semibold">{title}</legend>
    {help && <p className="font-body text-xs text-muted-foreground">{help}</p>}
    {children}
  </fieldset>;
}

function Input({ label, value, onChange, type = "text", placeholder, wide }: { label: string; value: string | number; onChange: (value: string) => void; type?: "text" | "number"; placeholder?: string; wide?: boolean }) {
  return <label className={wide ? "block sm:col-span-2" : "block"}><span className={ADMIN_LABEL_CLASS}>{label}</span>
    <input type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} inputMode={type === "number" ? "decimal" : undefined} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} className={ADMIN_INPUT_CLASS} /></label>;
}

/** Keeps exactly what the owner types (spaces included) and hands the parsed list up. */
function LinesField<T>({ label, help, initial, parse, onChange }: { label: string; help: string; initial: string; parse: (text: string) => T[]; onChange: (items: T[]) => void }) {
  const [text, setText] = useState(initial);
  return <label className="block"><span className={ADMIN_LABEL_CLASS}>{label}</span>
    <textarea rows={5} value={text} onChange={event => { setText(event.target.value); onChange(parse(event.target.value)); }} className={`${ADMIN_INPUT_CLASS} min-h-28`} />
    <span className="mt-1 block font-body text-xs text-muted-foreground">{help}</span></label>;
}

export default function MatchSummaryFields({ value, clubLabel, opponentLabel, onChange }: { value: MatchSummary; clubLabel: string; opponentLabel: string; onChange: (summary: MatchSummary) => void }) {
  const update = (changes: Partial<MatchSummary>) => onChange({ ...value, ...changes });
  const setEvent = (index: number, changes: Partial<MatchEvent>) => update({ events: value.events.map((event, i) => i === index ? { ...event, ...changes } : event) });
  const setLineup = (side: "club" | "opponent", changes: Partial<MatchLineup>) => update({ lineups: { ...value.lineups, [side]: { ...value.lineups[side], ...changes } } });
  return <div className="space-y-4">
    <Group title="Timeline" help="Goals, cards and substitutions in match order. Goals update the scorers shown on the homepage.">
      {value.events.map((event, index) => <div key={index} className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-4">
        <Input label="Minute" value={event.minute} placeholder="e.g. 45′+2′" onChange={minute => setEvent(index, { minute })} />
        <label className="block"><span className={ADMIN_LABEL_CLASS}>Team</span><select value={event.side} onChange={e => setEvent(index, { side: e.target.value as MatchEvent["side"] })} className={ADMIN_INPUT_CLASS}><option value="club">{clubLabel}</option><option value="opponent">{opponentLabel}</option></select></label>
        <label className="block sm:col-span-2"><span className={ADMIN_LABEL_CLASS}>Type</span><select value={event.kind} onChange={e => setEvent(index, { kind: e.target.value as MatchEvent["kind"] })} className={ADMIN_INPUT_CLASS}>{Object.entries(KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <Input wide label={event.kind === "sub" ? "Player on" : "Player"} value={event.player} placeholder="e.g. #8 J. Hernandez" onChange={player => setEvent(index, { player })} />
        <Input wide label={event.kind === "sub" ? "Player off" : event.kind === "goal" ? "Assist (optional)" : "Note (optional)"} value={event.detail} placeholder={event.kind === "goal" ? "e.g. Assist: #10 G. Alfaro" : event.kind === "sub" ? "e.g. #11 R. Vega" : ""} onChange={detail => setEvent(index, { detail })} />
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-4">
          <button type="button" className={button} disabled={index === 0} onClick={() => { const events = [...value.events]; [events[index - 1], events[index]] = [events[index], events[index - 1]]; update({ events }); }}>Move up</button>
          <button type="button" className={`${button} text-destructive`} onClick={() => update({ events: value.events.filter((_, i) => i !== index) })}>Remove</button>
        </div>
      </div>)}
      {value.events.length < MATCH_SUMMARY_LIMITS.events && <button type="button" className={button} onClick={() => update({ events: [...value.events, { minute: "", side: "club", kind: "goal", player: "", detail: "" }] })}>Add timeline entry</button>}
    </Group>

    <Group title="Statistics" help={`Numbers for ${clubLabel} and ${opponentLabel}. Decimals are fine.`}>
      {value.stats.map((stat, index) => <div key={index} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]">
        <Input wide label="Statistic" value={stat.label} onChange={label => update({ stats: value.stats.map((s, i) => i === index ? { ...s, label } : s) })} />
        <Input type="number" label={clubLabel} value={stat.club} onChange={text => update({ stats: value.stats.map((s, i) => i === index ? { ...s, club: Math.max(0, Number(text) || 0) } : s) })} />
        <Input type="number" label={opponentLabel} value={stat.opponent} onChange={text => update({ stats: value.stats.map((s, i) => i === index ? { ...s, opponent: Math.max(0, Number(text) || 0) } : s) })} />
        <button type="button" className={`${button} text-destructive`} onClick={() => update({ stats: value.stats.filter((_, i) => i !== index) })}>Remove</button>
      </div>)}
      <div className="flex flex-wrap gap-2">
        {value.stats.length === 0 && <button type="button" className={button} onClick={() => update({ stats: STANDARD_MATCH_STAT_LABELS.map(label => ({ label, club: 0, opponent: 0 })) })}>Add the standard 16 statistics</button>}
        {value.stats.length < MATCH_SUMMARY_LIMITS.stats && <button type="button" className={button} onClick={() => update({ stats: [...value.stats, { label: "", club: 0, opponent: 0 }] })}>Add statistic</button>}
      </div>
    </Group>

    <Group title="Officials">
      {value.officials.map((person, index) => <div key={index} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Input label="Role" value={person.role} onChange={role => update({ officials: value.officials.map((p, i) => i === index ? { ...p, role } : p) })} />
        <Input label="Name" value={person.name} onChange={name => update({ officials: value.officials.map((p, i) => i === index ? { ...p, name } : p) })} />
        <button type="button" className={`${button} text-destructive`} onClick={() => update({ officials: value.officials.filter((_, i) => i !== index) })}>Remove</button>
      </div>)}
      <div className="flex flex-wrap gap-2">
        {value.officials.length === 0 && <button type="button" className={button} onClick={() => update({ officials: OFFICIAL_ROLES.map(role => ({ role, name: "" })) })}>Add the referee crew</button>}
        {value.officials.length < MATCH_SUMMARY_LIMITS.officials && <button type="button" className={button} onClick={() => update({ officials: [...value.officials, { role: "", name: "" }] })}>Add official</button>}
      </div>
    </Group>

    <Group title={`${clubLabel} kit colors`}>
      {value.kit.map((row, index) => <div key={index} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Input label="Item" value={row.item} onChange={item => update({ kit: value.kit.map((k, i) => i === index ? { ...k, item } : k) })} />
        <Input label="Color" value={row.color} onChange={color => update({ kit: value.kit.map((k, i) => i === index ? { ...k, color } : k) })} />
        <button type="button" className={`${button} text-destructive`} onClick={() => update({ kit: value.kit.filter((_, i) => i !== index) })}>Remove</button>
      </div>)}
      {value.kit.length === 0 && <button type="button" className={button} onClick={() => update({ kit: KIT_ITEMS.map(item => ({ item, color: "" })) })}>Add jersey, shorts and socks</button>}
    </Group>

    {(["club", "opponent"] as const).map(side => {
      const label = side === "club" ? clubLabel : opponentLabel, lineup = value.lineups[side];
      return <Group key={side} title={`${label} lineup`}>
        <LinesField label="Starting XI" help="One player per line, like #8 J. Hernandez." initial={formatPeopleLines(lineup.starting)} parse={parsePeopleLines} onChange={starting => setLineup(side, { starting: starting.slice(0, MATCH_SUMMARY_LIMITS.starting) })} />
        <LinesField label="Bench" help="One player per line." initial={formatPeopleLines(lineup.bench)} parse={parsePeopleLines} onChange={bench => setLineup(side, { bench: bench.slice(0, MATCH_SUMMARY_LIMITS.bench) })} />
        <LinesField label="Managers and coaches" help="One per line, like G. Morales - Head Coach." initial={formatStaffLines(lineup.staff)} parse={parseStaffLines} onChange={staff => setLineup(side, { staff: staff.slice(0, MATCH_SUMMARY_LIMITS.staff) })} />
      </Group>;
    })}
  </div>;
}
