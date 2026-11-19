"use client";

import { useId, useRef } from "react";
import { IconCaretDown, IconCaretUp, IconUpload, IconWarning } from "@/components/admin/icons";
import FileUpload from "@/components/admin/FileUpload";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import ResilientImage from "@/components/ResilientImage";
import { GRAPHIC_UPLOAD_ACCEPT, GRAPHIC_UPLOAD_TYPES_LABEL } from "@/lib/media-upload-types";
import { SPONSOR_NAME_LIMIT, SPONSOR_WEBSITE_LIMIT, type SponsorDraft } from "@/lib/sponsor-content";
import { PLACE_CAP, PLACE_NOUN, inPlace, type Place } from "./rose-city-sponsors-model";
import styles from "./RoseCitySponsorsEditor.module.css";

export type SponsorFieldsApi = {
  drafts: readonly SponsorDraft[];
  locked: boolean;
  uploading: boolean;
  /** Website problems by sponsor key. */
  errors: Readonly<Record<string, string>>;
  canAdd: (place: Place) => boolean;
  setName: (key: string, name: string) => void;
  setWebsite: (key: string, website: string) => void;
  move: (key: string, place: Place, delta: -1 | 1) => void;
  remove: (key: string, place: Place) => void;
  toggle: (key: string, place: Place, on: boolean) => void;
  replace: (key: string, file: File) => void;
  add: (place: Place, files: FileList | null) => void;
};

const DESCRIPTION: Record<Place, string> = {
  carousel: "Sponsor logos shown on your homepage and your Sponsors page.",
  footer: "Static sponsor logos shown in the website footer.",
};

export function RoseCitySponsorFields({ api, place }: { api: SponsorFieldsApi; place: Place }) {
  const other: Place = place === "carousel" ? "footer" : "carousel";
  const list = inPlace(api.drafts, place);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const cap = PLACE_CAP[place];
  const otherFull = (draft: SponsorDraft) => !draft[other === "carousel" ? "homepage" : "footer"] && !api.canAdd(other);

  return (
    <div className={styles.fields} data-sponsor-fields={place}>
      <p className={styles.note}>{DESCRIPTION[place]}</p>
      <p className={styles.countLine} role="status">
        <span>{list.length} of {cap}</span>
        {list.length >= cap && <span className={styles.full}>{place === "carousel" ? "Homepage carousel" : "Footer"} is full</span>}
      </p>
      <ul className={styles.rows} aria-label={`Sponsors in the ${PLACE_NOUN[place]}`}>
        {list.map((draft, index) => (
          <SponsorRow
            key={draft.key}
            api={api}
            draft={draft}
            index={index}
            count={list.length}
            place={place}
            other={other}
            otherFull={otherFull(draft)}
            onReplace={() => { replacing.current = draft.key; replaceInput.current?.click(); }}
          />
        ))}
      </ul>
      <FileUpload
        label="Add sponsor logos"
        accept={GRAPHIC_UPLOAD_ACCEPT}
        hint={`${GRAPHIC_UPLOAD_TYPES_LABEL}, up to 5 MB`}
        multiple
        onUpload={(files) => api.add(place, files)}
        uploading={api.uploading}
        disabled={api.locked || !api.canAdd(place)}
      />
      <input
        ref={replaceInput}
        type="file"
        accept={GRAPHIC_UPLOAD_ACCEPT}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const key = replacing.current;
          replacing.current = null;
          event.target.value = "";
          if (file && key) api.replace(key, file);
        }}
      />
    </div>
  );
}

function SponsorRow({ api, draft, index, count, place, other, otherFull, onReplace }: {
  api: SponsorFieldsApi; draft: SponsorDraft; index: number; count: number; place: Place; other: Place; otherFull: boolean; onReplace: () => void;
}) {
  const id = useId();
  const blank = draft.name.trim() === "";
  const label = draft.name.trim() || `Sponsor ${index + 1}`;
  const error = api.errors[draft.key];
  const otherOn = draft[other === "carousel" ? "homepage" : "footer"];
  const otherName = other === "carousel" ? "homepage carousel" : "footer";
  return (
    <li className={styles.row} data-sponsor-row={draft.key}>
      <div className={styles.tile}>
        <ResilientImage src={draft.logo_url} alt={label} fill sizes="112px" className="object-contain p-2" />
        {blank && (
          <span className={styles.warn} role="img" title="Missing sponsor name. It will save as Sponsor N" aria-label="Missing sponsor name. It will save as Sponsor N">
            <IconWarning size={14} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className={styles.body}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            className={styles.input}
            value={draft.name}
            maxLength={SPONSOR_NAME_LIMIT}
            placeholder={`Sponsor ${index + 1} name`}
            aria-describedby={`${id}-name-hint`}
            disabled={api.locked}
            onChange={(event) => api.setName(draft.key, event.target.value)}
          />
          <p id={`${id}-name-hint`} className={styles.hint}>Left blank, it saves as “Sponsor {index + 1}”.</p>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-site`}>Their website (optional)</label>
          <input
            id={`${id}-site`}
            className={styles.input}
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={draft.website}
            maxLength={SPONSOR_WEBSITE_LIMIT}
            placeholder="theirshop.com"
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-site-hint${error ? ` ${id}-site-error` : ""}`}
            disabled={api.locked}
            onChange={(event) => api.setWebsite(draft.key, event.target.value)}
          />
          <p id={`${id}-site-hint`} className={styles.hint}>An address without https:// gets it added.</p>
          {error && <p id={`${id}-site-error`} className={styles.error}>{error}</p>}
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={`admin-press ${styles.tool}`} disabled={api.locked} onClick={onReplace} aria-label={`Replace logo for ${label}`}>
          <IconUpload size={16} aria-hidden="true" />
          Replace
        </button>
        <button type="button" className={`admin-press ${styles.tool}`} disabled={api.locked || index === 0} onClick={() => api.move(draft.key, place, -1)} aria-label={`Move ${label} up`}>
          <IconCaretUp size={16} aria-hidden="true" />
        </button>
        <button type="button" className={`admin-press ${styles.tool}`} disabled={api.locked || index === count - 1} onClick={() => api.move(draft.key, place, 1)} aria-label={`Move ${label} down`}>
          <IconCaretDown size={16} aria-hidden="true" />
        </button>
        <button type="button" className={`admin-press ${styles.tool} ${styles.remove}`} disabled={api.locked} onClick={() => api.remove(draft.key, place)} aria-label={`Remove ${label} from the ${PLACE_NOUN[place]}`}>
          Remove
        </button>
        <span className={styles.also}>
          <span id={`${id}-also`}>Also in the {otherName}</span>
          <AdminSwitch
            checked={otherOn}
            label={`Show ${label} in the ${otherName} too`}
            disabled={api.locked || (!otherOn && otherFull)}
            disabledReason={!otherOn && otherFull ? `The ${otherName} is full.` : undefined}
            onCheckedChange={(on) => api.toggle(draft.key, other, on)}
          />
        </span>
      </div>
    </li>
  );
}
