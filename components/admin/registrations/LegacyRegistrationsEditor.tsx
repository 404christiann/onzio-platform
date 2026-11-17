"use client";


import {
AlertCircle,
Archive,
Check,
Clipboard,
Radio,
Square,
Trash2
} from "@/components/admin/icons";

import { RegistrationsWorkspaceSkeleton } from "@/components/admin/AdminOperationsSkeletons";
import { AdminPage,AdminPageHeader,AdminPanel } from "@/components/admin/AdminPage";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Skeleton } from "@/components/ui/skeleton";

import { blank,button,formStatusLabel } from "./registration-editor-model";

import { RegistrationFormFields } from "./RegistrationFormFields";
import { RegistrationRegistrants } from "./RegistrationRegistrants";
import { useRegistrationsEditor } from "./useRegistrationsEditor";
export function LegacyRegistrationsEditor() {
 const model=useRegistrationsEditor();
 const { club, forms, formCounts, formView, setFormView, formTab, setFormTab, setRosterFilter, setRosterQuery, confirmDeleteId, setConfirmDeleteId, draft, setDraft, roster, setRoster, setOriginalPriceIds, connect, loading, saving, message, canEditStructure, edit, runFormAction, copyLink, saveDraft, visibleForms, activeFormCount, archivedFormCount, selectedFormRow } = model;
  if (loading)
    return (
      <AdminPage>
        <AdminPageHeader
          eyebrow="Registration desk"
          title="Registrations"
          description="Build forms, collect required consent, and keep a paid roster for each program."
          actions={<>
            <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-3.5">
              <span className="text-xs font-semibold text-muted-foreground">Club payment account</span>
              <AdminSkeletonRegion label="Loading payment account status"><Skeleton className="h-6 w-24 rounded-full" /></AdminSkeletonRegion>
            </div>
            <button disabled className={`${button} bg-primary text-primary-foreground disabled:opacity-50`}>New form</button>
          </>}
        />
        <RegistrationsWorkspaceSkeleton />
      </AdminPage>
    );
  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Registration desk"
        title="Registrations"
        description="Build forms, collect required consent, and keep a paid roster for each program."
        actions={
          <>
            <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-3.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Club payment account
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${connect?.chargesEnabled ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
              >
                {connect?.chargesEnabled ? "Charges enabled" : "Not ready"}
              </span>
            </div>
            <button
              className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
              onClick={() => {
                setFormView("active");
                setConfirmDeleteId(null);
                setDraft(blank(club.name));
                setRoster([]);
                setOriginalPriceIds([]);
                setFormTab("build");
                setRosterFilter("all");
                setRosterQuery("");
              }}
            >
              New form
            </button>
          </>
        }
      />
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-border bg-card p-3 text-sm text-card-foreground shadow-sm"
        >
          {message}
        </p>
      )}
      {!connect?.chargesEnabled && (
        <AdminPanel className="overflow-hidden p-0 sm:p-0">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span className="grid size-9 flex-none place-items-center rounded-xl bg-primary/10 text-xs font-semibold text-primary">
              S
            </span>
            <div>
              <p className="font-body text-sm font-semibold">
                Club payment account
              </p>
              <p className="text-xs text-muted-foreground">Payments by Stripe</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-x-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
              Not ready
            </span>
          </div>
          <div className="divide-y divide-border">
            {[
              { label: "Account connected", done: Boolean(connect?.connected) },
              { label: "Charges enabled", done: Boolean(connect?.chargesEnabled) },
              { label: "Payouts enabled", done: Boolean(connect?.payoutsEnabled) },
            ].map((step) => (
              <div
                key={step.label}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                {step.done ? (
                  <Check
                    aria-hidden="true"
                    className="size-4 flex-none rounded-full bg-success/10 p-0.5 text-success"
                  />
                ) : (
                  <AlertCircle
                    aria-hidden="true"
                    className="size-4 flex-none rounded-full bg-warning/10 p-0.5 text-warning"
                  />
                )}
                <span className="text-sm text-foreground">{step.label}</span>
                {!step.done && (
                  <span className="ml-auto text-xs font-semibold text-warning">
                    Pending
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-muted-foreground">
              Free forms work now. Connect Stripe before publishing a paid
              form.
            </p>
            <form action="/api/stripe/connect" method="post">
              <button
                className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
              >
                {connect?.connected ? "Continue onboarding" : "Connect Stripe"}
              </button>
            </form>
          </div>
        </AdminPanel>
      )}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-24">
          <div
            className="inline-flex w-full rounded-xl border border-border bg-muted/50 p-1"
            aria-label="Registration form views"
          >
            <button
              type="button"
              aria-pressed={formView === "active"}
              onClick={() => setFormView("active")}
              className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition ${
                formView === "active"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Forms · {activeFormCount}
            </button>
            <button
              type="button"
              aria-pressed={formView === "archived"}
              onClick={() => setFormView("archived")}
              className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition ${
                formView === "archived"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Archived · {archivedFormCount}
            </button>
          </div>
          {visibleForms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
              <p className="font-semibold text-foreground">
                {formView === "archived"
                  ? "No archived forms."
                  : "No registration forms yet."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formView === "archived"
                  ? "Forms you archive will keep their registrant records here."
                  : "Create a form, add its fields and pricing, then publish it."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleForms.map((form) => {
                const counts = formCounts[form.id] ?? { paid: 0, total: 0 };
                const status = formStatusLabel(form);
                const selected = draft.id === form.id;
                const canPublish = form.status !== "open";
                const canStop = form.status === "open";
                const canCopy = form.status !== "draft";
                const canDelete = counts.total === 0;
                const actionTotal =
                  (canPublish ? 1 : 0) +
                  (canStop ? 1 : 0) +
                  (canCopy ? 1 : 0) +
                  1 +
                  (canDelete ? 1 : 0);
                const trailingFull = actionTotal % 2 === 1;
                return (
                  <article
                    key={form.id}
                    className={`min-w-0 rounded-2xl border border-l-4 bg-card p-4 transition ${
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : form.archived_at
                          ? "border-l-muted-foreground/30 border-y-border border-r-border"
                          : form.status === "open"
                            ? "border-l-success border-y-border border-r-border"
                            : "border-l-warning border-y-border border-r-border"
                    }`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => void edit(form)}
                        className="min-h-11 min-w-0 flex-1 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <span className="block truncate font-semibold text-foreground">
                          {form.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {counts.paid} paid {counts.paid === 1 ? "registrant" : "registrants"}
                        </span>
                      </button>
                      <span
                        className={`inline-flex shrink-0 items-center gap-x-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          status === "Live"
                              ? "bg-success/10 text-success"
                            : status === "Archived"
                              ? "bg-muted text-muted-foreground"
                              : "bg-warning/10 text-warning"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${
                            status === "Live"
                              ? "bg-success"
                              : status === "Archived"
                                ? "bg-muted-foreground"
                                : "bg-warning"
                          }`}
                        />
                        {status}
                      </span>
                    </div>
                    {!form.archived_at && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {canPublish && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void runFormAction(form, "publish")}
                            className={`${button} bg-success text-success-foreground hover:bg-success/90`}
                          >
                            <Radio aria-hidden="true" className="size-4" />
                            Publish
                          </button>
                        )}
                        {canStop && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void runFormAction(form, "stop")}
                            className={`${button} border border-warning/40 bg-background text-warning hover:bg-warning/10`}
                          >
                            <Square aria-hidden="true" className="size-4" />
                            Stop registrations
                          </button>
                        )}
                        {canCopy && (
                          <button
                            type="button"
                            onClick={() => void copyLink(form)}
                            className={`${button} border border-border text-foreground hover:bg-accent`}
                          >
                            <Clipboard aria-hidden="true" className="size-4" />
                            Copy link
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void runFormAction(form, "archive")}
                          className={`${button} border border-border text-foreground hover:bg-accent ${!canDelete && trailingFull ? "col-span-2" : ""}`}
                        >
                          <Archive aria-hidden="true" className="size-4" />
                          Archive
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setConfirmDeleteId(form.id)}
                            className={`${button} border border-destructive/25 text-destructive hover:bg-destructive/10 ${trailingFull ? "col-span-2" : ""}`}
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                    {confirmDeleteId === form.id && (
                      <div className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 p-3">
                        <p className="text-sm text-destructive">
                          Permanently delete this empty form? This cannot be undone.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className={`${button} border border-border text-foreground hover:bg-accent`}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void runFormAction(form, "delete")}
                            className={`${button} bg-destructive text-destructive-foreground hover:bg-destructive/90`}
                          >
                            Delete form
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <AdminPanel className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground">
                {draft.id ? "Selected form" : "Creating form"}
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold text-foreground">
                {draft.id ? draft.title || "Untitled form" : "New form"}
              </p>
            </div>
            {draft.id && draft.archivedAt && (
              <span className="inline-flex items-center gap-x-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                <Archive aria-hidden="true" className="size-3.5" />
                Archived
              </span>
            )}
            {draft.id && (
              <AdminTabs
                items={[
                  { id: "build", label: "Form" },
                  { id: "registrants", label: "Registrants", badge: roster.length },
                ]}
                value={formTab}
                onChange={(id) => setFormTab(id as "build" | "registrants")}
                tabsId="registration-form"
                label="Form sections"
                className="ml-auto"
              />
            )}
          </AdminPanel>

          {draft.archivedAt && (
            <p className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              Archived forms are read-only. Registrant data and CSV export
              remain available below.
            </p>
          )}
          {!draft.archivedAt && draft.status === "open" && (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center">
              <span
                aria-hidden="true"
                className="mt-1.5 hidden size-2 flex-none rounded-full bg-warning sm:block"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-warning">
                  This form is live, so fields and prices are locked
                </p>
                <p className="mt-1 text-sm text-warning/90">
                  Stop registrations to edit the structure. Name and
                  description stay editable.
                </p>
              </div>
              <button
                type="button"
                disabled={saving || !selectedFormRow}
                onClick={() =>
                  selectedFormRow && void runFormAction(selectedFormRow, "stop")
                }
                className={`${button} flex-none border border-warning/40 bg-background text-warning hover:bg-warning/10`}
              >
                <Square aria-hidden="true" className="size-4" />
                Stop registrations
              </button>
            </div>
          )}

          <div
            id={draft.id ? "registration-form-panel-build" : undefined}
            role={draft.id ? "tabpanel" : undefined}
            aria-labelledby={draft.id ? "registration-form-tab-build" : undefined}
            hidden={draft.id ? formTab !== "build" : false}
            className="flex flex-col gap-4"
          >
<RegistrationFormFields model={model} />
            <AdminPanel className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              {!canEditStructure && !draft.archivedAt && (
                <p className="text-sm text-muted-foreground">
                  Structure changes are disabled while the form is live.
                </p>
              )}
              <button
                disabled={saving || !canEditStructure}
                onClick={saveDraft}
                className={`${button} ml-auto bg-primary text-primary-foreground hover:bg-primary/90`}
              >
                {saving ? "Saving…" : "Save form"}
              </button>
            </AdminPanel>
            </div>
        {draft.id && (
<RegistrationRegistrants model={model} />        )}
      </div>
    </div>
    </AdminPage>
  );
}
