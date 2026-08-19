"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// Mirrors onzio.registration_forms / onzio.registration_responses (see
// supabase/migrations/20260818120100_registration_forms_responses.sql). Only
// the columns this page actually renders or sorts by -- the server component
// selects the same narrow set explicitly, scoped to the session's own
// club_id, before any of this ever reaches the browser.
export type ResponsesFormRow = {
  id: string;
  title: string;
  form_type: "general_interest" | "academy_registration";
  status: "draft" | "live" | "closed";
};

export type ResponsesResponseRow = {
  id: string;
  form_id: string;
  submitted_at: string;
  player_first_name: string;
  player_last_name: string;
  parent_guardian_name: string;
  parent_guardian_email: string;
  parent_guardian_phone: string;
  payment_status: "not_required" | "pending" | "paid" | "failed";
};

type SortColumn = "submitted_at" | "player_name" | "parent_name" | "payment_status";
type SortDirection = "asc" | "desc";

const FORM_TYPE_LABEL: Record<ResponsesFormRow["form_type"], string> = {
  general_interest: "General interest",
  academy_registration: "Academy registration",
};

const PAYMENT_STATUS_LABEL: Record<ResponsesResponseRow["payment_status"], string> = {
  not_required: "Not required",
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
};

const PAYMENT_STATUS_CLASS: Record<ResponsesResponseRow["payment_status"], string> = {
  not_required: "bg-muted/60 text-muted-foreground",
  pending: "bg-amber-500/15 text-amber-500",
  paid: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

function formatSubmittedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ResponsesClient({
  forms,
  responses,
}: {
  forms: ResponsesFormRow[];
  responses: ResponsesResponseRow[];
}) {
  const [selectedFormId, setSelectedFormId] = useState<string | null>(
    forms[0]?.id ?? null,
  );
  const [sortColumn, setSortColumn] = useState<SortColumn>("submitted_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const selectedForm = forms.find((form) => form.id === selectedFormId) ?? null;

  const responsesByForm = useMemo(() => {
    const counts = new Map<string, number>();
    for (const response of responses) {
      counts.set(response.form_id, (counts.get(response.form_id) ?? 0) + 1);
    }
    return counts;
  }, [responses]);

  const rows = useMemo(() => {
    const filtered = selectedFormId
      ? responses.filter((response) => response.form_id === selectedFormId)
      : [];
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case "submitted_at":
          comparison = a.submitted_at < b.submitted_at ? -1 : a.submitted_at > b.submitted_at ? 1 : 0;
          break;
        case "player_name": {
          const nameA = `${a.player_last_name} ${a.player_first_name}`.toLowerCase();
          const nameB = `${b.player_last_name} ${b.player_first_name}`.toLowerCase();
          comparison = nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
          break;
        }
        case "parent_name": {
          const nameA = a.parent_guardian_name.toLowerCase();
          const nameB = b.parent_guardian_name.toLowerCase();
          comparison = nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
          break;
        }
        case "payment_status":
          comparison = a.payment_status < b.payment_status ? -1 : a.payment_status > b.payment_status ? 1 : 0;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [responses, selectedFormId, sortColumn, sortDirection]);

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "submitted_at" ? "desc" : "asc");
    }
  }

  function SortHeader({ column, label }: { column: SortColumn; label: string }) {
    const active = sortColumn === column;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className={cn(
          "flex items-center gap-1 font-display text-xs font-black uppercase tracking-widest transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
        )}
      >
        {label}
        {active && (
          <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>
        )}
      </button>
    );
  }

  if (forms.length === 0) {
    return (
      <p className="font-body text-sm text-muted-foreground">
        No registration forms yet. Create one to start collecting responses.
      </p>
    );
  }

  return (
    <div>
      {/* Form selector */}
      <div className="mb-6 flex flex-col gap-3">
        {forms.map((form) => {
          const isSelected = form.id === selectedFormId;
          const count = responsesByForm.get(form.id) ?? 0;
          return (
            <div
              key={form.id}
              className={cn(
                "flex flex-col gap-3 rounded-xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
                isSelected ? "border-brand/40 bg-card" : "border-border bg-card/60",
              )}
            >
              <button
                type="button"
                onClick={() => setSelectedFormId(form.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2",
                    isSelected ? "border-brand bg-brand" : "border-border bg-transparent",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate font-display text-base font-black uppercase text-foreground">
                    {form.title}
                  </span>
                  <span className="font-body text-xs text-muted-foreground">
                    {FORM_TYPE_LABEL[form.form_type]} · {form.status} · {count} response{count === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
              <a
                href={`/api/admin/responses/export?formId=${form.id}`}
                className="flex-shrink-0 rounded-lg border border-border bg-muted/40 px-4 py-2 text-center font-display text-xs font-black uppercase tracking-widest text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              >
                Export CSV
              </a>
            </div>
          );
        })}
      </div>

      {/* Table */}
      {!selectedForm ? null : rows.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">
          No responses yet for {selectedForm.title}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <div className="min-w-[720px]">
            <div
              className={cn(
                "grid gap-4 border-b border-border bg-card px-5 py-3",
                selectedForm.form_type === "academy_registration"
                  ? "grid-cols-[160px_1fr_1fr_140px]"
                  : "grid-cols-[160px_1fr_1fr]",
              )}
            >
              <SortHeader column="submitted_at" label="Submitted" />
              <SortHeader column="player_name" label="Player" />
              <SortHeader column="parent_name" label="Parent / guardian" />
              {selectedForm.form_type === "academy_registration" && (
                <SortHeader column="payment_status" label="Payment" />
              )}
            </div>
            <div className="flex flex-col">
              {rows.map((response) => (
                <div
                  key={response.id}
                  className={cn(
                    "grid gap-4 border-t border-border/40 bg-card px-5 py-4 transition-colors hover:bg-accent/40 first:border-t-0",
                    selectedForm.form_type === "academy_registration"
                      ? "grid-cols-[160px_1fr_1fr_140px]"
                      : "grid-cols-[160px_1fr_1fr]",
                  )}
                >
                  <span className="font-body text-sm text-muted-foreground">
                    {formatSubmittedDate(response.submitted_at)}
                  </span>
                  <span className="min-w-0 truncate font-body text-sm text-foreground">
                    {response.player_first_name} {response.player_last_name}
                  </span>
                  <span className="min-w-0 truncate font-body text-sm text-muted-foreground">
                    {response.parent_guardian_name}
                    <span className="block truncate text-xs text-muted-foreground/70">
                      {response.parent_guardian_email} · {response.parent_guardian_phone}
                    </span>
                  </span>
                  {selectedForm.form_type === "academy_registration" && (
                    <span>
                      <span
                        className={cn(
                          "inline-block rounded px-2 py-0.5 font-display text-[0.65rem] font-black uppercase tracking-widest",
                          PAYMENT_STATUS_CLASS[response.payment_status],
                        )}
                      >
                        {PAYMENT_STATUS_LABEL[response.payment_status]}
                      </span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
