"use client";

import { useId, type ReactNode } from "react";
import { IconAdd, IconClose } from "@/components/admin/icons";
import { editTargetProps, type EditTargetId } from "@/lib/admin-edit-targets";
import { AdminImageField, type AdminImageFieldProps } from "../AdminImageField";
import { appendItem, appendRow, appendString, patchAt, removeAt as removeItemAt, removeRow, setCell, setStringAt } from "./listOps";
import { useStableKeys } from "./stableKeys";
import styles from "./fields.module.css";

/* ---------- image field with a description line ---------- */

export type ImageFieldWithDescriptionProps = AdminImageFieldProps & {
  /** One line on where the image appears or how it is cropped. */
  description: ReactNode;
};

/** AdminImageField (unchanged) plus a description line the field is described by. Square by default. */
export function ImageFieldWithDescription({ description, shape = "square", size = 96, ...image }: ImageFieldWithDescriptionProps) {
  const descriptionId = useId();
  return (
    <div className={styles.imageField} role="group" aria-label={image.label} aria-describedby={descriptionId} data-image-field-with-description="">
      <AdminImageField {...image} shape={shape} size={size} />
      <p id={descriptionId} className={styles.description}>{description}</p>
    </div>
  );
}

/* ---------- shared bits ---------- */

function AddButton({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`admin-press ${styles.add}`} disabled={disabled} onClick={onClick}>
      <IconAdd size={16} aria-hidden="true" />
      {children}
    </button>
  );
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`admin-press ${styles.remove}`} aria-label={label} disabled={disabled} onClick={onClick}>
      <IconClose size={16} aria-hidden="true" />
    </button>
  );
}

function Limit({ id, count, max, noun }: { id: string; count: number; max: number; noun: string }) {
  return (
    <p id={id} className={styles.limit} role="status">
      {count >= max ? `Maximum of ${max} ${noun} reached.` : `${count} of ${max} ${noun}.`}
    </p>
  );
}

/* ---------- string list ---------- */

export type StringListFieldProps = {
  label: string;
  description?: ReactNode;
  items: readonly string[];
  onChange: (items: string[]) => void;
  max: number;
  /** Fewest items allowed. Remove is disabled at this count. Default 0. */
  min?: number;
  /** What one item is called, singular, for button names. Default "item". */
  itemLabel?: string;
  /** Plural noun for the count line. Default `${itemLabel}s`. */
  itemsLabel?: string;
  maxLength?: number;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  /** Click-to-field: the id a preview click focuses item `index` by. Stamped on the item's row only; none, no attribute. */
  itemTarget?: (index: number) => EditTargetId | undefined;
};

export function StringListField({
  label,
  description,
  items,
  onChange,
  max,
  min = 0,
  itemLabel = "item",
  itemsLabel,
  maxLength,
  placeholder,
  multiline,
  disabled = false,
  itemTarget,
}: StringListFieldProps) {
  const id = useId();
  const { keys, removeAt } = useStableKeys(items.length);
  const atMax = items.length >= max;
  const noun = itemsLabel ?? `${itemLabel}s`;

  return (
    <fieldset className={styles.list} disabled={disabled} data-string-list="" aria-describedby={`${id}-limit`}>
      <legend className={styles.legend}>{label}</legend>
      {description && <p className={styles.description}>{description}</p>}
      <ul className={styles.rows}>
        {items.map((value, index) => (
          <li key={keys[index]} className={styles.row} {...editTargetProps(itemTarget?.(index))}>
            {multiline ? (
              <textarea
                className={styles.input}
                aria-label={`${label}, ${itemLabel} ${index + 1}`}
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                onChange={(event) => onChange(setStringAt(items, index, event.target.value))}
              />
            ) : (
              <input
                className={styles.input}
                aria-label={`${label}, ${itemLabel} ${index + 1}`}
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                onChange={(event) => onChange(setStringAt(items, index, event.target.value))}
              />
            )}
            <RemoveButton
              label={`Remove ${itemLabel} ${index + 1}`}
              disabled={items.length <= min}
              onClick={() => {
                removeAt(index);
                onChange(removeItemAt(items, index, min));
              }}
            />
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        <AddButton disabled={atMax} onClick={() => onChange(appendString(items, max))}>Add {itemLabel}</AddButton>
        <Limit id={`${id}-limit`} count={items.length} max={max} noun={noun} />
      </div>
    </fieldset>
  );
}

/* ---------- object list ---------- */

export type ObjectListFieldProps<T> = {
  label: string;
  description?: ReactNode;
  items: readonly T[];
  onChange: (items: T[]) => void;
  max: number;
  min?: number;
  /** Stable id for each record, taken from the saved data. Never the index. */
  getId: (item: T) => string;
  /** A new record with its own fresh id. */
  createItem: () => T;
  /** The fields of one record. Call update with only what changed. */
  renderItem: (item: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
  itemLabel?: string;
  itemsLabel?: string;
  disabled?: boolean;
};

export function ObjectListField<T>({
  label,
  description,
  items,
  onChange,
  max,
  min = 0,
  getId,
  createItem,
  renderItem,
  itemLabel = "item",
  itemsLabel,
  disabled = false,
}: ObjectListFieldProps<T>) {
  const id = useId();
  const atMax = items.length >= max;
  const noun = itemsLabel ?? `${itemLabel}s`;

  return (
    <fieldset className={styles.list} disabled={disabled} data-object-list="" aria-describedby={`${id}-limit`}>
      <legend className={styles.legend}>{label}</legend>
      {description && <p className={styles.description}>{description}</p>}
      <ul className={styles.records}>
        {items.map((item, index) => (
          <li key={getId(item)} className={styles.record}>
            <div className={styles.recordHead}>
              <span className={styles.recordTitle}>{`${capitalize(itemLabel)} ${index + 1}`}</span>
              <RemoveButton
                label={`Remove ${itemLabel} ${index + 1}`}
                disabled={items.length <= min}
                onClick={() => onChange(removeItemAt(items, index, min))}
              />
            </div>
            <div className={styles.recordFields}>
              {renderItem(item, index, (patch) => onChange(patchAt(items as readonly (T & object)[], index, patch as Partial<T & object>) as T[]))}
            </div>
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        <AddButton disabled={atMax} onClick={() => onChange(appendItem(items, createItem(), max))}>Add {itemLabel}</AddButton>
        <Limit id={`${id}-limit`} count={items.length} max={max} noun={noun} />
      </div>
    </fieldset>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ---------- small table editor ---------- */

export type TableColumn = { key: string; label: string; maxLength?: number; placeholder?: string };

export type TableEditorProps = {
  label: string;
  description?: ReactNode;
  columns: readonly TableColumn[];
  /** One string[] per row, one string per column in column order. */
  rows: readonly (readonly string[])[];
  onChange: (rows: string[][]) => void;
  maxRows: number;
  minRows?: number;
  rowLabel?: string;
  disabled?: boolean;
  /** Click-to-field: the id a preview click focuses the cell at (`rowIndex`, column `key`) by. Stamped on the cell only; none, no attribute. */
  cellTarget?: (rowIndex: number, columnKey: string) => EditTargetId | undefined;
};

/** Text cells in a table of N columns and up to M rows, with add and remove row. */
export function TableEditor({
  label,
  description,
  columns,
  rows,
  onChange,
  maxRows,
  minRows = 0,
  rowLabel = "row",
  disabled = false,
  cellTarget,
}: TableEditorProps) {
  const id = useId();
  const { keys, removeAt } = useStableKeys(rows.length);
  const atMax = rows.length >= maxRows;
  return (
    <fieldset className={styles.list} disabled={disabled} data-table-editor="" aria-describedby={`${id}-limit`}>
      <legend className={styles.legend}>{label}</legend>
      {description && <p className={styles.description}>{description}</p>}
      {/* The wrapper scrolls sideways on a phone and is focusable so keyboard users can scroll it. */}
      <div className={styles.tableWrap} role="region" aria-label={`${label} table`} tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">{column.label}</th>
              ))}
              <th scope="col"><span className="sr-only">Remove {rowLabel}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={keys[rowIndex]}>
                {columns.map((column, columnIndex) => (
                  <td key={column.key} {...editTargetProps(cellTarget?.(rowIndex, column.key))}>
                    <input
                      className={styles.input}
                      aria-label={`${column.label}, ${rowLabel} ${rowIndex + 1}`}
                      value={row[columnIndex] ?? ""}
                      maxLength={column.maxLength}
                      placeholder={column.placeholder}
                      onChange={(event) => onChange(setCell(rows, columns.length, rowIndex, columnIndex, event.target.value))}
                    />
                  </td>
                ))}
                <td className={styles.removeCell}>
                  <RemoveButton
                    label={`Remove ${rowLabel} ${rowIndex + 1}`}
                    disabled={rows.length <= minRows}
                    onClick={() => {
                      removeAt(rowIndex);
                      onChange(removeRow(rows, columns.length, rowIndex, minRows));
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.footer}>
        <AddButton disabled={atMax} onClick={() => onChange(appendRow(rows, columns.length, maxRows))}>
          Add {rowLabel}
        </AddButton>
        <Limit id={`${id}-limit`} count={rows.length} max={maxRows} noun={`${rowLabel}s`} />
      </div>
    </fieldset>
  );
}
