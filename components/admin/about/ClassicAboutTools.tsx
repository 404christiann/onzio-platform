"use client";

import { createContext, useCallback, useContext, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { AdminDialog, AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { AdminSaveActions } from "@/components/admin/ui/AdminSaveButton";
import type { SaveState } from "@/components/admin/ui/useSaveState";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { AdminToastProvider, useAdminToast } from "@/components/admin/ui/AdminToast";
import { useAnimatedList } from "@/components/admin/ui/useAnimatedList";
import { Button } from "@/components/ui/button";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import { Textarea } from "@/components/ui/textarea";
import { newAboutValue } from "@/lib/about-editor/collections";
import type { AboutValue } from "@/lib/about-content";
import type { DBAboutPageContent } from "@/lib/db-types";

const DialogToastHostContext = createContext<(host: HTMLElement | null) => void>(() => {});

export function ClassicAboutToastBoundary({ children }: { children: ReactNode }) {
  const [pageHost, setPageHost] = useState<HTMLDivElement | null>(null);
  const [dialogHost, setDialogHost] = useState<HTMLElement | null>(null);
  return <DialogToastHostContext.Provider value={setDialogHost}>
    <AdminToastProvider portalTarget={dialogHost ?? pageHost}>
      {children}
      <div ref={setPageHost} className="aep-toast-page-host" />
    </AdminToastProvider>
  </DialogToastHostContext.Provider>;
}

export function ClassicAboutActions({ guardDirty, busy, blocked, state, onSave, onSaveAll, onDiscard }: {
  guardDirty: boolean;
  busy: boolean;
  blocked: boolean;
  state: SaveState;
  onSave: () => void;
  onSaveAll: () => Promise<boolean>;
  onDiscard: () => void;
}) {
  const latestSaveAll = useRef(onSaveAll);
  latestSaveAll.current = onSaveAll;
  useUnsavedGuard({ dirty: guardDirty, edited: "About and Club Logo pages", onSave: () => latestSaveAll.current(), onDiscard });
  return <AdminSaveActions state={busy ? "saving" : blocked ? "clean" : state} onSave={onSave} stackOnMobile />;
}

export function ClassicAboutTools({ open, onClose, title, children, opener }: {
  opener: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode;
}) {
  const setToastHost = useContext(DialogToastHostContext);
  const setFooterHost = useCallback((host: HTMLElement | null) => setToastHost(open ? host : null), [open, setToastHost]);
  return <AdminDialog open={open} onClose={onClose} finalFocus={() => opener.current ?? false} title={title ?? "About section"} size={title === "Story" || title === "Values" ? "lg" : "md"}
    footer={<AdminDialogFooter status={<div ref={setFooterHost} />} primary={<Button type="button" onClick={onClose}>Done</Button>} />}>
    <div className="aep-classic-fields">{children}</div>
  </AdminDialog>;
}

type Update = (content: DBAboutPageContent) => DBAboutPageContent;

export function ClassicAboutValues({ content, invalid, onChange, ids, generation }: {
  content: DBAboutPageContent; invalid: boolean; ids: MutableRefObject<string[]>; generation: MutableRefObject<number>; onChange: (update: Update) => void;
}) {
  const { showUndo } = useAdminToast();
  const list = useAnimatedList();
  while (ids.current.length < content.values.length) ids.current.push(crypto.randomUUID());
  ids.current.length = content.values.length;

  function updateValue(index: number, field: keyof AboutValue, value: string) {
    onChange(current => ({ ...current, values: current.values.map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  }

  function move(index: number, direction: number) {
    const target = index + direction;
    const id = ids.current[index];
    list.change({ type: "reorder" }, () => {
      ids.current.splice(index, 1); ids.current.splice(target, 0, id);
      onChange(current => {
        const values = [...current.values];
        const [value] = values.splice(index, 1); values.splice(target, 0, value);
        return { ...current, values };
      });
    });
  }

  function remove(index: number) {
    const id = ids.current[index], value = content.values[index], epoch = generation.current;
    list.change({ type: "remove", key: id }, () => {
      ids.current.splice(index, 1);
      onChange(current => ({ ...current, values: current.values.filter((_, i) => i !== index) }));
    });
    showUndo({ message: value.title ? `Removed ${value.title}` : "Removed value", onUndo: () => {
      if (generation.current !== epoch || ids.current.length >= 24 || ids.current.includes(id)) return;
      list.change({ type: "add", key: id }, () => {
        const position = Math.min(index, ids.current.length);
        ids.current.splice(position, 0, id);
        onChange(current => {
          if (current.values.length >= 24) return current;
          const values = [...current.values]; values.splice(Math.min(position, values.length), 0, value);
          return { ...current, values };
        });
      });
    } });
  }

  return <div className="aep-values-editor">
    <label className="block"><span className={ADMIN_LABEL_CLASS}>Values heading</span>
      <input className={ADMIN_INPUT_CLASS} value={content.values_heading} maxLength={500} onChange={event => onChange(current => ({ ...current, values_heading: event.target.value }))} />
    </label>
    <h3>Values · {content.values.length} of 24</h3>
    <div ref={list.listRef} className="aep-values-list">
      {content.values.map((value, index) => <div key={ids.current[index]} {...list.rowProps(ids.current[index])} className="aep-value-card">
        <div className="aep-value-actions"><span>Value {index + 1}</span><div>
          <button type="button" aria-label={`Move value ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button type="button" aria-label={`Move value ${index + 1} later`} disabled={index === content.values.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          <button type="button" aria-label={`Remove value ${index + 1}`} onClick={() => remove(index)}><Trash2 size={16} /></button>
        </div></div>
        <label className="block"><span className={ADMIN_LABEL_CLASS}>Value {index + 1} Title</span>
          <input data-value-title={ids.current[index]} className={ADMIN_INPUT_CLASS} value={value.title} maxLength={500} required aria-describedby={`aep-value-error-${ids.current[index]}`} aria-invalid={invalid && !value.title.trim() || undefined} onChange={event => updateValue(index, "title", event.target.value)} />
        </label>
        <p id={`aep-value-error-${ids.current[index]}`} className="aep-inline-error">{invalid && !value.title.trim() ? "Give this value a title, or remove it." : ""}</p>
        <label className="block"><span className={ADMIN_LABEL_CLASS}>Value {index + 1} Description</span>
          <Textarea value={value.description} maxLength={10000} rows={3} onChange={event => updateValue(index, "description", event.target.value)} />
        </label>
      </div>)}
    </div>
    <Button type="button" variant="outline" disabled={content.values.length >= 24} onClick={() => {
      const id = crypto.randomUUID();
      list.change({ type: "add", key: id }, () => {
        ids.current.push(id);
        onChange(current => ({ ...current, values: [...current.values, { ...newAboutValue(), title: "" }] }));
      });
      list.listRef.current?.querySelector<HTMLInputElement>(`[data-value-title="${id}"]`)?.focus();
    }}>Add value</Button>
    {content.values.length === 0 && <p className="text-sm text-muted-foreground">No values yet. Add one to show this section on the page.</p>}
    {content.values.length >= 24 && <p className="text-sm text-muted-foreground">You can show up to 24 values.</p>}
  </div>;
}
