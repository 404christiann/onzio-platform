"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { IconCaretLeft, IconCaretRight, IconClose } from "@/components/admin/icons";
import styles from "./EditorDialog.module.css";
import { editTargetHasFocus, focusEditTarget, refocusEditTarget } from "./editTargets";
import {
  createFocusInterruption,
  editorDialogReducer,
  initialEditorDialogState,
  stepFocusRequest,
  type EditorDialogFocusRequest,
  type EditorDialogState,
  type FocusStepState,
} from "./editorDialogFocus";

export type { EditorDialogFocusRequest } from "./editorDialogFocus";
import { applyInertOutside, tabbablesIn, wrapTarget } from "./inertOutside";
import { EditorDialogSkeletonBody } from "./skeletons";

export const EDITOR_DIALOG_PHONE_QUERY = "(max-width: 767px)";

function subscribePhone(listener: () => void) {
  const query = window.matchMedia(EDITOR_DIALOG_PHONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const isPhone = () => window.matchMedia(EDITOR_DIALOG_PHONE_QUERY).matches;
const serverPhone = () => false;

export type EditorDialogSection = {
  id: string;
  title: string;
  /** Shown under the title in the phone Sections list. */
  summary?: ReactNode;
};

/**
 * State for opening the dialog from an Edit button. It remembers the button so
 * focus returns to it on close (Safari does not focus a button when it is
 * clicked, so the dialog cannot rely on the previously focused element).
 */
export function useEditorDialog<Id extends string = string>() {
  const [state, dispatch] = useReducer(editorDialogReducer<Id>, initialEditorDialogState as EditorDialogState<Id>);
  const opener = useRef<HTMLElement | null>(null);

  const open = useCallback((id: Id, event?: MouseEvent<HTMLElement>) => {
    opener.current = event?.currentTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dispatch({ type: "open", id });
  }, []);
  const close = useCallback(() => dispatch({ type: "close" }), []);
  const switchTo = useCallback((id: Id) => dispatch({ type: "switch", id }), []);
  /**
   * Ask the dialog to focus one field of the section it shows. Call it after openSection or switchTo (they drop any
   * earlier request). The dialog scrolls the field into view, focuses it and rings it briefly. A target that is not
   * on the section is ignored, so the dialog opens exactly as it does without one.
   */
  const focusField = useCallback((target: string | null | undefined) => {
    if (target) dispatch({ type: "focus", target });
  }, []);

  return {
    open: state.openId !== null,
    /** The section to show. It keeps its last value while the dialog fades out. */
    activeId: state.openId ?? state.lastId,
    openSection: open,
    close,
    switchTo,
    focusField,
    /** Pass to EditorDialog's focusRequest. */
    focusRequest: state.focusRequest,
    returnFocusRef: opener as RefObject<HTMLElement | null>,
  };
}

export type EditorDialogProps = {
  open: boolean;
  onClose: () => void;
  /** The dialog's name, for example "Edit Robinson Stadium". */
  title: string;
  sections: readonly EditorDialogSection[];
  activeId: string | null;
  onActiveChange: (id: string) => void;
  /** Fields for one section. Only the active section is mounted. Edits go to the page draft, not to a save. */
  renderSection: (id: string) => ReactNode;
  /** From useEditorDialog(). Focus goes back to the Edit button that opened the dialog. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  doneLabel?: string;
  footerNote?: ReactNode;
  /** Show the shape-matched skeleton in place of the sections and fields. */
  loading?: boolean;
  /**
   * "split" shows the fields and the live section side by side on desktop (it needs renderPreview).
   * On a phone the same two views sit behind a Fields / Preview switch. Default "fields".
   */
  mode?: "fields" | "split";
  /** The section as it looks on the public page, at the width of the preview column (about 380px). Rendered inert. */
  renderPreview?: (id: string) => ReactNode;
  previewHint?: ReactNode;
  /**
   * Replaces the default "Edits stay on the page" note and Done footer, on desktop and on a phone (where the default
   * footer is not shown). For an editor that saves one item from its own dialog: status on the left, Cancel and Save on
   * the right. Left out, the footer is unchanged.
   */
  footer?: ReactNode;
  /** From useEditorDialog().focusRequest: the field to focus once its section is showing. Left out, nothing changes. */
  focusRequest?: EditorDialogFocusRequest | null;
};

export function EditorDialog(props: EditorDialogProps) {
  const { open, onClose, returnFocusRef } = props;
  const labelId = useId();
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);

  // AdminModal does not set aria-modal and leaves the page behind reachable, so the dialog does both itself.
  useEffect(() => {
    if (!open || !popup) return;
    popup.setAttribute("aria-modal", "true");
    const restore = applyInertOutside(popup, (element) => element.getAttribute("data-slot") === "editor-dialog-backdrop");
    return () => {
      popup.removeAttribute("aria-modal");
      restore();
    };
  }, [open, popup]);

  return (
    <AdminModal
      ref={setPopup}
      data-mode={props.mode === "split" && props.renderPreview ? "split" : "fields"}
      open={open}
      onClose={onClose}
      className={styles.popup}
      backdropClassName={styles.backdrop}
      backdropSlot="editor-dialog-backdrop"
      data-slot="editor-dialog"
      aria-labelledby={labelId}
      inert={!open}
      finalFocus={returnFocusRef}
    >
      <EditorDialogBody {...props} labelId={labelId} />
    </AdminModal>
  );
}

/** The dialog content without the modal wrapper. Exported for render tests. */
export function EditorDialogBody({
  onClose,
  title,
  sections,
  activeId,
  onActiveChange,
  renderSection,
  doneLabel = "Done",
  footerNote = "Edits stay on the page until you press Save.",
  loading = false,
  mode = "fields",
  renderPreview,
  previewHint = "How this section looks on the page",
  footer,
  focusRequest,
  labelId,
}: EditorDialogProps & { labelId: string }) {
  const phone = useSyncExternalStore(subscribePhone, isPhone, serverPhone);
  // Opened from a card's Edit button, the phone goes straight to that section. Back returns to the list.
  const [view, setView] = useState<"list" | "section">("section");
  const active = sections.find((section) => section.id === activeId) ?? sections[0];
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const showList = phone && view === "list";
  const split = mode === "split" && Boolean(renderPreview);
  // Phone split: one column with a Fields / Preview switch, as the prototype does.
  const [tab, setTab] = useState<"fields" | "preview">("fields");
  const shell = useRef<HTMLDivElement>(null);

  // Tab and Shift+Tab wrap inside the dialog. The modal primitive's focus guards would let focus reach the page.
  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || event.defaultPrevented || !shell.current) return;
    const container = shell.current;
    const target = wrapTarget(tabbablesIn(container), document.activeElement, event.shiftKey, container);
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (phone) heading.current?.focus({ preventScroll: true });
  }, [view, phone]);

  // Focus a requested field: phone goes to the section's fields first; then stepFocusRequest (editorDialogFocus.ts) runs
  // once a frame: it retries until the field mounts, then holds focus for a moment against the modal's own initial
  // focus, unless the person clicks or presses a key. The request counts as handled only when that loop ends.
  const handledNonce = useRef(0);
  const requestNonce = focusRequest?.nonce ?? 0;
  const requestTarget = focusRequest?.target ?? null;
  useEffect(() => {
    if (!requestTarget || requestNonce === handledNonce.current || loading) return;
    if (phone && (view !== "section" || (split && tab !== "fields"))) {
      setView("section");
      setTab("fields");
      return;
    }
    const container = shell.current;
    if (!container) return;
    let step: FocusStepState = { startedAt: performance.now(), focusedAt: null };
    let frame = 0;
    const interruption = createFocusInterruption(() => step.focusedAt !== null);
    document.addEventListener("pointerdown", interruption.onInput, true);
    document.addEventListener("keydown", interruption.onInput, true);
    const deps = {
      now: () => performance.now(),
      focus: () => focusEditTarget(container, requestTarget),
      holds: () => editTargetHasFocus(container, requestTarget, document.activeElement),
      refocus: () => { refocusEditTarget(container, requestTarget); },
      interrupted: interruption.interrupted,
    };
    const tick = () => {
      const next = stepFocusRequest(step, deps);
      step = next.state;
      if (next.outcome === "continue") frame = window.requestAnimationFrame(tick);
      else handledNonce.current = requestNonce;
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", interruption.onInput, true);
      document.removeEventListener("keydown", interruption.onInput, true);
    };
  }, [requestNonce, requestTarget, loading, phone, view, tab, split, active?.id]);

  const panelHeadingId = `${labelId}-panel`;

  return (
    <div ref={shell} className={styles.shell} data-view={phone ? view : "split"} data-split={split || undefined} data-footer={footer ? "" : undefined} onKeyDown={trapTab} data-editor-dialog="">
      <header className={styles.header}>
        {phone && view === "section" && (
          <button type="button" className={`admin-press ${styles.back}`} onClick={() => setView("list")} data-editor-dialog-back="">
            <IconCaretLeft size={18} aria-hidden="true" />
            <span>Sections</span>
          </button>
        )}
        <h2 id={labelId} ref={heading} tabIndex={-1} className={styles.title}>
          {phone ? (showList ? title : active?.title) : title}
        </h2>
        {phone ? (
          <button type="button" className={`admin-press ${styles.done}`} onClick={onClose} data-editor-dialog-done="">{doneLabel}</button>
        ) : (
          <button type="button" className={`admin-press ${styles.close}`} aria-label="Close" onClick={onClose}>
            <IconClose size={18} aria-hidden="true" />
          </button>
        )}
      </header>

      <div className={styles.body} aria-busy={loading || undefined}>
        {loading && <EditorDialogSkeletonBody sectionCount={sections.length || 6} />}
        {!loading && (!phone || showList) && (
          <nav className={styles.sections} aria-label="Sections" data-editor-dialog-sections="">
            <ul>
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`admin-press ${styles.sectionButton}`}
                    aria-current={!phone && section.id === active?.id ? "true" : undefined}
                    onClick={() => {
                      onActiveChange(section.id);
                      setTab("fields");
                      setView("section");
                    }}
                  >
                    <span className={styles.sectionText}>
                      <span className={styles.sectionTitle}>{section.title}</span>
                      {phone && section.summary != null && <span className={styles.sectionSummary}>{section.summary}</span>}
                    </span>
                    {phone && <IconCaretRight size={18} aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {!loading && (!phone || !showList) && active && (
          <section className={styles.panel} aria-labelledby={panelHeadingId} data-editor-dialog-panel={active.id}>
            <h3 id={panelHeadingId} className={styles.panelTitle}>{active.title}</h3>
            {split && phone && (
              <div className={styles.viewSwitch} role="group" aria-label="View">
                {(["fields", "preview"] as const).map((value) => (
                  <button key={value} type="button" className={`admin-press ${styles.viewButton}`} aria-pressed={tab === value} onClick={() => setTab(value)}>
                    {value === "fields" ? "Fields" : "Preview"}
                  </button>
                ))}
              </div>
            )}
            <div className={styles.panelGrid} data-split={split || undefined}>
              {(!split || !phone || tab === "fields") && <div className={styles.fieldsColumn}>{renderSection(active.id)}</div>}
              {split && (!phone || tab === "preview") && (
                <div className={styles.previewColumn} data-editor-dialog-preview="">
                  <p className={styles.previewHint}>{previewHint}</p>
                  <div className={styles.previewBox} aria-hidden="true" inert>{renderPreview?.(active.id)}</div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {footer && <footer className={`${styles.footer} ${styles.customFooter}`} data-editor-dialog-footer="">{footer}</footer>}
      {!phone && !footer && (
        <footer className={styles.footer}>
          <p className={styles.note}>{footerNote}</p>
          <button type="button" className={`admin-press ${styles.done}`} onClick={onClose} data-editor-dialog-done="">{doneLabel}</button>
        </footer>
      )}
    </div>
  );
}
