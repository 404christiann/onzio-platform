"use client";


import {
Check,
Search
} from "@/components/admin/icons";

import { AdminPanel } from "@/components/admin/AdminPage";
import {
formatRegistrationUsd
} from "@/lib/registration-currency";

import { answerText,button,input,registrationName,type Registration } from "./registration-editor-model";
import { type RegistrationsEditorModel } from "./useRegistrationsEditor";

export function RegistrationRegistrants({ model, onView }: { model: RegistrationsEditorModel; onView?: (entry: Registration) => void }) {
 const { formTab, rosterFilter, setRosterFilter, rosterQuery, setRosterQuery, draft, roster, answerRows, recoveryCount, paidCount, refundedCount, collectedCents, visibleRoster } = model;
 return (
          <div
            id="registration-form-panel-registrants"
            role="tabpanel"
            aria-labelledby="registration-form-tab-registrants"
            hidden={formTab !== "registrants"}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  Paid
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                  {paidCount}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  Collected
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                  {formatRegistrationUsd(collectedCents)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  Refunded
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                  {refundedCount}
                </p>
              </div>
              <div
                className={`rounded-2xl border p-4 ${
                  recoveryCount > 0
                    ? "border-destructive/30 bg-destructive/10"
                    : "border-border bg-card"
                }`}
              >
                <p
                  className={`text-xs font-semibold   ${
                    recoveryCount > 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  Needs review
                </p>
                <p
                  className={`mt-1.5 text-2xl font-semibold tabular-nums ${
                    recoveryCount > 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {recoveryCount}
                </p>
              </div>
            </div>

            <AdminPanel className="overflow-hidden p-0 sm:p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                <div className="relative w-full sm:w-64">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="search"
                    value={rosterQuery}
                    onChange={(event) => setRosterQuery(event.target.value)}
                    placeholder="Search name or email"
                    aria-label="Search registrants by name or email"
                    className={`${input} pl-9`}
                  />
                </div>
                {(
                  [
                    { id: "all", label: "All", count: roster.length },
                    { id: "paid", label: "Paid", count: paidCount },
                    { id: "refunded", label: "Refunded", count: refundedCount },
                    { id: "review", label: "Review", count: recoveryCount },
                  ] as const
                ).map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={rosterFilter === filter.id}
                    onClick={() => setRosterFilter(filter.id)}
                    className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-semibold transition ${
                      rosterFilter === filter.id
                        ? filter.id === "review"
                          ? "border-destructive bg-destructive text-destructive-foreground"
                          : "border-primary bg-primary text-primary-foreground"
                        : filter.id === "review"
                          ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                          : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {filter.label} {filter.count}
                  </button>
                ))}
                <a
                  className={`${button} ml-auto w-full border border-border hover:bg-accent sm:w-auto`}
                  href={`/api/admin/registrations/export?formId=${draft.id}`}
                >
                  Export CSV
                </a>
              </div>

              {roster.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No paid registrations yet.
                </p>
              ) : visibleRoster.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No registrants match this filter.
                </p>
              ) : (
              <>
                <div className="px-4 pb-4">
                <div className="mt-5 space-y-3 md:hidden">
                  {visibleRoster.map((entry) => {
                    const recovery = entry.payment_recovery_required;
                    return (
                      <details
                        key={entry.id}
                        className="group min-w-0 rounded-2xl border border-border bg-background open:border-primary/30"
                      >
                        <summary className="flex min-h-14 cursor-pointer list-none items-start justify-between gap-3 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-foreground">
                              {registrationName(entry)}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {formatRegistrationUsd(entry.amount_cents)} · {new Date(
                                entry.submitted_at,
                              ).toLocaleDateString()}
                            </span>
                          </span>
                          <span
                            className={`inline-flex shrink-0 items-center gap-x-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                              recovery
                                ? "bg-destructive/10 text-destructive"
                                : entry.status === "paid"
                                  ? "bg-success/10 text-success"
                                  : "bg-warning/10 text-warning"
                            }`}
                          >
                            {!recovery && entry.status === "paid" && (
                              <Check aria-hidden="true" className="size-3.5" />
                            )}
                            {recovery
                              ? "Review"
                              : entry.status === "paid"
                                ? "Paid"
                                : "Refunded"}
                          </span>
                        </summary>
                        <div className="border-t border-border px-4 py-4">
                          {recovery && (
                            <p className="mb-4 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                              Payment completion needs manual review before this
                              record is treated as confirmed.
                            </p>
                          )}
                          <dl className="space-y-3">
                            {answerRows(entry).map((answer) => (
                              <div key={answer.key} className="min-w-0">
                                <dt className="text-xs font-semibold text-muted-foreground">
                                  {answer.label}
                                </dt>
                                <dd className="mt-1 break-words text-sm text-foreground">
                                  {answer.isSignature
                                    ? "Signature captured"
                                    : answerText(answer.value)}
                                </dd>
                              </div>
                            ))}
                            <div>
                              <dt className="text-xs font-semibold text-muted-foreground">
                                Email
                              </dt>
                              <dd className="mt-1 break-all text-sm text-foreground">
                                {entry.registrant_email}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-semibold text-muted-foreground">
                                Price paid
                              </dt>
                              <dd className="mt-1 text-sm text-foreground">
                                {entry.price_label} · {formatRegistrationUsd(
                                  entry.amount_cents,
                                )}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </details>
                    );
                  })}
                </div>
                </div>

                <div className="px-4 pb-4">
                <div className="mt-5 hidden md:block">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="border-b border-border text-xs text-muted-foreground">
                      <tr>
                        <th className="w-[26%] px-3 py-3">Registrant</th>
                        <th className="w-[24%] px-3 py-3">Email</th>
                        <th className="w-[16%] px-3 py-3">Price</th>
                        <th className="w-[14%] px-3 py-3 text-right">Amount</th>
                        <th className="w-[20%] px-3 py-3">Submitted</th>
{onView && <th className="w-20 px-3 py-3"><span className="sr-only">Details</span></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRoster.map((entry) => (
                        <tr
                          key={entry.id}
                          className={`border-b border-border ${entry.payment_recovery_required ? "bg-destructive/5" : ""}`}
                        >
                          <td className="px-3 py-3 align-top">
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={`inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  entry.payment_recovery_required
                                    ? "bg-destructive/10 text-destructive"
                                    : entry.status === "paid"
                                      ? "bg-success/10 text-success"
                                      : "bg-warning/10 text-warning"
                                }`}
                              >
                                {entry.payment_recovery_required
                                  ? "Review"
                                  : entry.status === "paid"
                                    ? "Paid"
                                    : "Refunded"}
                              </span>
                              <span className="truncate font-medium">
                                {registrationName(entry)}
                              </span>
                            </span>
                          </td>
                          <td className="truncate px-3 py-3 align-top text-muted-foreground">
                            {entry.registrant_email}
                          </td>
                          <td className="truncate px-3 py-3 align-top text-muted-foreground">
                            {entry.price_label}
                          </td>
                          <td className="px-3 py-3 align-top text-right font-medium tabular-nums">
                            {formatRegistrationUsd(entry.amount_cents)}
                          </td>
                          <td className="px-3 py-3 align-top text-muted-foreground">
                            {new Date(entry.submitted_at).toLocaleDateString()}
                          </td>
{onView && <td className="px-2 py-3"><button type="button" className="admin-press registration-view" onClick={() => onView(entry)}>View<span className="sr-only"> {registrationName(entry)}</span></button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              </>
            )}
            </AdminPanel>
            <p className="text-xs text-muted-foreground">
              Paid and refunded registrations only. Pending and expired
              attempts stay out.
            </p>
          </div>

 );
}
