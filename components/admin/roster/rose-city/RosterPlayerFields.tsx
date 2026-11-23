"use client";

import { useId, type ReactNode } from "react";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { ImageFieldWithDescription, ValidationMessage } from "@/components/admin/ui/editor-kit";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { IconCaretDown } from "@/components/admin/icons";
import { NATIONALITIES } from "@/lib/nationalities";
import { PLAYER_MAX_AGE, PLAYER_MIN_AGE } from "@/lib/roster-player-age";
import { editTargetProps } from "@/lib/admin-edit-targets";
import type { PlayerForm, Position } from "../roster-model";
import { ROSTER_POSITIONS, ROSTER_POSITION_ABBR, initialsOf, type PlayerField, type PlayerProblems } from "./rose-city-roster-model";
import { rosterTarget, type RosterField } from "./roster-edit-targets";
import styles from "./rose-city-roster.module.css";

export type PlayerSectionId = "basics" | "details" | "background" | "stats" | "photos" | "visibility";

/** `target` is the click-to-field id a card click focuses this control by (stamped on the wrapper; the first control inside takes focus). */
type TargetFor = (field: RosterField) => ReturnType<typeof editTargetProps>;
/** The stamps for one player's controls. A player not saved yet has no id, so its controls carry none. */
export const targetsFor = (playerId: string | undefined): TargetFor => field => editTargetProps(playerId ? rosterTarget(playerId, field) : null);

function Field({ id, label, required, problem, help, children, target }: { id: string; label: string; required?: boolean; problem?: string; help?: ReactNode; children: ReactNode; target?: ReturnType<typeof editTargetProps> }) {
  return (
    <div className={styles.field} {...target}>
      <label htmlFor={id} className={styles.label}>{label}{required && <span className={styles.req} aria-hidden="true">*</span>}</label>
      {children}
      {help && <p id={`${id}-help`} className={styles.help}>{help}</p>}
      {problem && <ValidationMessage id={`${id}-problem`} live="assertive" className={styles.problem}>{problem}</ValidationMessage>}
    </div>
  );
}

export type PlayerBasicsProps = {
  /** The saved player's id: the row every control's click-to-field target is keyed by. Undefined while adding a new player. */
  playerId?: string;
  form: PlayerForm;
  onChange: (form: PlayerForm) => void;
  problems: PlayerProblems;
  /** What the photo field shows: a chosen file's preview, the saved photo, or nothing for the club-logo placeholder. */
  photoPreview: string | null;
  uploading: boolean;
  onPhotoChange: (file: File | null) => void;
  onPhotoPendingChange: (pending: boolean) => void;
};

const aria = (id: string, problems: PlayerProblems, field: PlayerField, help = false) => ({
  "aria-invalid": problems[field] ? true : undefined,
  "aria-describedby": [help ? `${id}-help` : null, problems[field] ? `${id}-problem` : null].filter(Boolean).join(" ") || undefined,
});

export function PlayerBasicsFields({ playerId, form, onChange, problems, photoPreview, uploading, onPhotoChange, onPhotoPendingChange }: PlayerBasicsProps) {
  const uid = useId();
  const set = (field: keyof PlayerForm, value: string | number) => onChange({ ...form, [field]: value });
  const id = (name: string) => `${uid}-${name}`;
  const at = targetsFor(playerId);
  return (
    <div className={styles.fields}>
      <p className={styles.help} style={{ margin: 0 }}>Required fields are marked with *.</p>
      <ImageFieldWithDescription
        target={playerId ? rosterTarget(playerId, "photo") : undefined}
        label="Player photo"
        description="PNG, JPG or WebP, up to 15 MB. It uploads when you save. Without one, the roster shows the club crest."
        previewUrl={photoPreview}
        initials={initialsOf(form.name)}
        size={72}
        shape="circle"
        allowedTypes={["image/png", "image/jpeg", "image/webp"]}
        maxBytes={15 * 1024 * 1024}
        uploading={uploading}
        onPendingChange={onPhotoPendingChange}
        onUpload={async files => { onPhotoChange(files[0]); return true; }}
        onRemove={() => { onPhotoChange(null); onChange({ ...form, photo_url: "" }); }}
      />
      <div className={styles.row2}>
        <Field id="player-name" label="Name" required problem={problems.name} target={at("name")}>
          <input id="player-name" type="text" required placeholder="e.g. Christian Alcala" value={form.name} className={ADMIN_INPUT_CLASS}
            {...aria("player-name", problems, "name")} onChange={event => set("name", event.target.value)} />
        </Field>
        <Field id="player-number" label="Jersey number" required problem={problems.number} help="0 to 99" target={at("number")}>
          <input id="player-number" type="number" required min={0} max={99} className={ADMIN_INPUT_CLASS}
            value={String(Number.isNaN(form.number) ? "" : form.number)} {...aria("player-number", problems, "number", true)}
            onFocus={event => event.currentTarget.select()}
            onChange={event => set("number", event.target.value === "" ? NaN : Number(event.target.value))} />
        </Field>
      </div>
      <div className={styles.row2}>
        <div className={styles.field}>
          <span className={styles.label} id={id("position")}>Position<span className={styles.req} aria-hidden="true">*</span></span>
          <div role="group" aria-labelledby={id("position")} className={styles.positions}>
            {ROSTER_POSITIONS.map(position => (
              <button key={position} type="button" className="admin-press" aria-pressed={form.position === position} aria-label={position}
                {...(form.position === position ? at("position") : {})} onClick={() => set("position", position satisfies Position)}>{ROSTER_POSITION_ABBR[position]}</button>
            ))}
          </div>
        </div>
        <Field id="player-nationality" label="Nationality" required problem={problems.nationality} target={at("nationality")}>
          <NativeSelect chevronIcon={IconCaretDown} id="player-nationality" required value={form.nationality} {...aria("player-nationality", problems, "nationality")}
            onChange={event => set("nationality", event.target.value)}>
            <NativeSelectOption value="">Select nationality…</NativeSelectOption>
            {form.nationality && !NATIONALITIES.some(item => item.label === form.nationality) && <NativeSelectOption value={form.nationality}>{form.nationality}</NativeSelectOption>}
            {NATIONALITIES.map(item => <NativeSelectOption key={item.label} value={item.label}>{item.flag} {item.label}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
      </div>
      <Field id="player-pronunciation" label="Pronunciation" target={at("pronunciation")}>
        <input id="player-pronunciation" type="text" placeholder='e.g. "duh-MORE-ee-uh"' value={form.pronunciation ?? ""} className={ADMIN_INPUT_CLASS}
          onChange={event => set("pronunciation", event.target.value)} />
      </Field>
    </div>
  );
}

export function PlayerDetailsFields({ playerId, form, onChange, problems }: Pick<PlayerBasicsProps, "playerId" | "form" | "onChange" | "problems">) {
  const set = (field: keyof PlayerForm, value: string | number) => onChange({ ...form, [field]: value });
  const captain = form.caption === "(C)";
  const at = targetsFor(playerId);
  return (
    <div className={styles.fields}>
      <div className={styles.row2}>
        <Field id="player-height" label="Height" required problem={problems.height} target={at("height")}>
          <input id="player-height" type="text" required placeholder={"e.g. 5'10\""} value={form.height} className={ADMIN_INPUT_CLASS}
            {...aria("player-height", problems, "height")} onChange={event => set("height", event.target.value)} />
        </Field>
        <Field id="player-weight" label="Weight" required problem={problems.weight} target={at("weight")}>
          <input id="player-weight" type="text" required placeholder="e.g. 165 lbs" value={form.weight} className={ADMIN_INPUT_CLASS}
            {...aria("player-weight", problems, "weight")} onChange={event => set("weight", event.target.value)} />
        </Field>
      </div>
      <div className={styles.row2}>
        <Field id="player-age" label="Age" required problem={problems.age} help={<>{PLAYER_MIN_AGE} to {PLAYER_MAX_AGE}. Players under {PLAYER_MIN_AGE} aren&rsquo;t supported yet.</>} target={at("age")}>
          <input id="player-age" type="number" required min={PLAYER_MIN_AGE} max={PLAYER_MAX_AGE} value={String(form.age || "")} className={ADMIN_INPUT_CLASS}
            {...aria("player-age", problems, "age", true)} onChange={event => set("age", Number(event.target.value))} />
        </Field>
        <Field id="player-hometown" label="Hometown" required problem={problems.hometown} target={at("hometown")}>
          <input id="player-hometown" type="text" required placeholder="e.g. Portland, OR" value={form.hometown} className={ADMIN_INPUT_CLASS}
            {...aria("player-hometown", problems, "hometown")} onChange={event => set("hometown", event.target.value)} />
        </Field>
      </div>
      <Field id="player-foot" label="Preferred foot" target={at("foot")}>
        <NativeSelect chevronIcon={IconCaretDown} id="player-foot" value={form.foot ?? ""} onChange={event => set("foot", event.target.value)}>
          <NativeSelectOption value="">Select a foot</NativeSelectOption>
          <NativeSelectOption value="Right">Right</NativeSelectOption>
          <NativeSelectOption value="Left">Left</NativeSelectOption>
          <NativeSelectOption value="Both">Both</NativeSelectOption>
        </NativeSelect>
      </Field>
      <div className={styles.switchRow} {...at("captain")}>
        <span><b id="player-captain-label">Captain</b><small>Shows (C) next to this player&rsquo;s name.</small></span>
        <AdminSwitch checked={captain} label="Captain" onCheckedChange={next => set("caption", next ? "(C)" : "")} />
      </div>
    </div>
  );
}

export function PlayerBackgroundFields({ playerId, form, onChange }: Pick<PlayerBasicsProps, "playerId" | "form" | "onChange">) {
  const set = (field: keyof PlayerForm, value: string) => onChange({ ...form, [field]: value });
  const at = targetsFor(playerId);
  return (
    <div className={styles.fields}>
      <div className={styles.row2}>
        <Field id="player-school" label="School" target={at("school")}>
          <input id="player-school" type="text" placeholder="e.g. University of Portland" value={form.school ?? ""} className={ADMIN_INPUT_CLASS}
            onChange={event => set("school", event.target.value)} />
        </Field>
        <Field id="player-previous-club" label="Previous club" target={at("previousClub")}>
          <input id="player-previous-club" type="text" placeholder="e.g. Portland FC" value={form.previous_club ?? ""} className={ADMIN_INPUT_CLASS}
            onChange={event => set("previous_club", event.target.value)} />
        </Field>
      </div>
      <Field id="player-bio" label="Bio" target={at("bio")}>
        <Textarea id="player-bio" placeholder="Short player bio…" value={form.bio ?? ""} rows={4} onChange={event => set("bio", event.target.value)} />
      </Field>
    </div>
  );
}

export function PlayerVisibilityFields({ playerId, active, onChange, disabled }: { playerId?: string; active: boolean; onChange: (active: boolean) => void; disabled: boolean }) {
  return (
    <div className={styles.fields}>
      <div className={styles.switchRow} {...targetsFor(playerId)("visible")}>
        <span><b>Show on the public roster</b><small>Hidden players keep their stats and can be shown again.</small></span>
        <AdminSwitch id="classic-player-visible" checked={active} label="Show on the public roster" disabled={disabled} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
