"use client";


import {
ChevronDown,
ChevronUp,
Plus
} from "@/components/admin/icons";

import { AdminPanel } from "@/components/admin/AdminPage";
import {
formatRegistrationUsdInput,
parseRegistrationUsdInput
} from "@/lib/registration-currency";
import {
type RegistrationFieldType,
type RegistrationParticipantScope
} from "@/lib/registration-fields";
import { registrationPublicUrl } from "@/lib/registration-public-link";
import {
REGISTRATION_WAIVER_LEGAL_HINT
} from "@/lib/registration-waiver";

import { button,input,types } from "./registration-editor-model";
import { type RegistrationsEditorModel } from "./useRegistrationsEditor";

export function RegistrationFormFields({ model, section, readOnly = false }: { model: RegistrationsEditorModel; section?: "basics" | "questions" | "prices" | "waiver"; readOnly?: boolean }) {
 const { club, waiverExpanded, setWaiverExpanded, draft, setDraft, saving, core, canEditStructure, copyLink, selectedFormRow } = model;
 return <><div hidden={section !== undefined && section !== "basics"} data-registration-section="basics"><AdminPanel className="overflow-hidden p-0 sm:p-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-5 py-4">
                <h3 className="font-body text-base font-semibold">
                  Basics
                </h3>
                <p className="text-sm text-muted-foreground">
                  Name, description, who it is for
                </p>
              </div>
              <div className="flex flex-col gap-5 p-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Form name
                    <input
                      disabled={saving || readOnly}
                      className={`${input} mt-1`}
                      value={draft.title}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                    />
                  </label>
                  <div className="block text-sm font-medium">
                    Public link
                    {draft.id && selectedFormRow ? (
                      <div className="mt-1 flex min-h-11 items-center gap-2 rounded-xl border border-input bg-muted/50 px-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                          {registrationPublicUrl({
                            currentOrigin: window.location.origin,
                            primaryDomain: club.primaryDomain,
                            formSlug: draft.slug,
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => void copyLink(selectedFormRow)}
                          className="min-h-11 flex-none rounded-lg px-2 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Copy
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 flex min-h-11 items-center rounded-xl border border-dashed border-border px-3 text-xs text-muted-foreground">
                        Available after you save the form.
                      </p>
                    )}
                  </div>
                </div>
                <label className="block text-sm font-medium">
                  Description
                  <textarea
                    disabled={saving || readOnly}
                    className={`${input} mt-1 min-h-24`}
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </label>
                <fieldset
                  disabled={!canEditStructure || saving}
                  className="rounded-2xl border border-border p-4 disabled:opacity-60"
                >
                  <legend className="px-1 text-sm font-semibold">
                    Participant mode
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {([
                      {
                        value: "minor_only",
                        label: "Minor only",
                        hint: "Player and guardian details.",
                      },
                      {
                        value: "adult_only",
                        label: "Adult only",
                        hint: "Self-registrant details.",
                      },
                      {
                        value: "both",
                        label: "Minor or adult",
                        hint: "Registrant chooses the branch.",
                      },
                    ] as const).map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary/70 has-[:checked]:bg-primary/10"
                      >
                        <input
                          type="radio"
                          name="participant-mode"
                          value={option.value}
                          checked={draft.participantMode === option.value}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              participantMode: option.value,
                            })
                          }
                          className="mt-0.5 accent-primary"
                        />
                        <span>
                          <b className="block text-sm">{option.label}</b>
                          <span className="block text-xs text-muted-foreground">
                            {option.hint}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Changing this changes which core fields the public form
                    asks for.
                  </p>
                </fieldset>
              </div>
            </AdminPanel>

</div>
<div hidden={section !== undefined && section !== "questions"} data-registration-section="questions"><AdminPanel className="overflow-hidden p-0 sm:p-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-4">
                <h3 className="font-body text-base font-semibold">
                  Questions
                </h3>
                <p className="text-sm text-muted-foreground">
                  {core.length} core · {draft.custom.length} of your own
                </p>
                <button
                  type="button"
                  disabled={!canEditStructure || saving}
                  className={`${button} ml-auto border border-border hover:bg-accent`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      custom: [
                        ...draft.custom,
                        {
                          field_key: "",
                          label: "",
                          field_type: "short_text",
                          options: [],
                          required: false,
                          is_core: false,
                          participant_scope: "all",
                          position: draft.custom.length,
                        },
                      ],
                    })
                  }
                >
                  <Plus aria-hidden="true" className="inline-block size-3.5 align-middle" /> Add question
                </button>
              </div>
              <div className="flex flex-col gap-5 p-5">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    Required core fields
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {core.map((field) => (
                      <span
                        key={field.field_key}
                        className="inline-flex items-center gap-x-2 rounded-xl bg-muted/50 px-3 py-2 text-xs font-medium text-foreground"
                      >
                        {field.label}
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {field.field_key}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <fieldset
                  disabled={!canEditStructure || saving}
                  className="flex flex-col gap-3 border-t border-border pt-5 disabled:opacity-60"
                >
                  <legend className="mb-1 px-0 text-xs font-semibold text-muted-foreground">
                    Your questions
                  </legend>
                  {draft.custom.map((field, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-border p-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <label className="block text-sm font-medium">
                          <span className="mb-2 block">Question</span>
                          <input
                            className={input}
                            placeholder="Label"
                            value={field.label}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                custom: draft.custom.map((item, i) =>
                                  i === index
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="block text-sm font-medium">
                          <span className="mb-2 block">Question key</span>
                          <input
                            className={input}
                            placeholder="field_key"
                            value={field.field_key}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                custom: draft.custom.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        field_key: event.target.value
                                          .toLowerCase()
                                          .replace(/[^a-z0-9_]/g, ""),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="block text-sm font-medium">
                          <span className="mb-2 block">Answer type</span>
                          <select
                            className={input}
                            value={field.field_type}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                custom: draft.custom.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        field_type: event.target
                                          .value as RegistrationFieldType,
                                        options: [],
                                      }
                                    : item,
                                ),
                              })
                            }
                          >
                            {types.map((type) => (
                              <option
                                key={type}
                                value={type}
                                className="bg-popover"
                              >
                                {type.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm font-medium">
                          <span className="mb-2 block">Ask this question to</span>
                          <select
                            className={input}
                            aria-label="Participant branch"
                            value={field.participant_scope}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                custom: draft.custom.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        participant_scope: event.target
                                          .value as RegistrationParticipantScope,
                                      }
                                    : item,
                                ),
                              })
                            }
                          >
                            <option value="all" className="bg-popover">
                              Both branches
                            </option>
                            <option value="minor" className="bg-popover">
                              Minors only
                            </option>
                            <option value="adult" className="bg-popover">
                              Adults only
                            </option>
                          </select>
                        </label>
                      </div>
                      {field.field_type === "dropdown" && (
                        <label className="mt-3 block text-sm font-medium">
                          <span className="mb-2 block">Choices, separated by commas</span>
                          <input
                            className={input}
                            placeholder="Option 1, Option 2"
                            value={field.options.join(", ")}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                custom: draft.custom.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        options: event.target.value.split(","),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                      <div className="mt-3 flex justify-between">
                        <label className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">
                          <input
                            className="mr-2 accent-primary"
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                custom: draft.custom.map((item, i) =>
                                  i === index
                                    ? { ...item, required: event.target.checked }
                                    : item,
                                ),
                              })
                            }
                          />
                          Required
                        </label>
                        <button
                          className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm text-destructive"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              custom: draft.custom.filter((_, i) => i !== index),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </fieldset>
              </div>
            </AdminPanel>

</div>
<div hidden={section !== undefined && section !== "prices"} data-registration-section="prices"><AdminPanel className="overflow-hidden p-0 sm:p-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-4">
                <h3 className="font-body text-base font-semibold">
                  Price options
                </h3>
                <p className="text-sm text-muted-foreground">
                  Enter dollars. Removed options stay inactive for payment
                  history.
                </p>
                <button
                  type="button"
                  disabled={!canEditStructure || saving}
                  className={`${button} ml-auto border border-border hover:bg-accent`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      prices: [
                        ...draft.prices,
                        {
                          label: "",
                          amount: "",
                          active: true,
                          position: draft.prices.length,
                        },
                      ],
                    })
                  }
                >
                  Add price
                </button>
              </div>
              <fieldset
                disabled={!canEditStructure || saving}
                className="flex flex-col gap-3 p-5 disabled:opacity-60"
              >
                {draft.prices.map((price, index) => (
                  <div
                    className="grid min-w-0 gap-3 rounded-2xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto] sm:items-center sm:border-0 sm:p-0"
                    key={price.id ?? index}
                  >
                    <label className="block text-sm font-medium">
                      <span className="mb-2 block">Price name</span>
                    <input
                      className={input}
                      placeholder="Registration fee"
                      value={price.label}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          prices: draft.prices.map((item, i) =>
                            i === index
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    </label>
                    <label className="block text-sm font-medium">
                      <span className="mb-2 block">Amount in dollars</span>
                      <span className="relative block">
                      <span aria-hidden={section !== undefined || undefined} className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-muted-foreground">
                        $
                      </span>
                      <input
                        aria-label={`${price.label || `Price option ${index + 1}`} amount in dollars`}
                        className={`${input} pl-7 tabular-nums`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={price.amount}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            prices: draft.prices.map((item, i) =>
                              i === index
                                ? { ...item, amount: event.target.value }
                                : item,
                            ),
                          })
                        }
                        onBlur={() => {
                          const parsed = parseRegistrationUsdInput(price.amount);
                          if (parsed.kind !== "valid") return;
                          setDraft({
                            ...draft,
                            prices: draft.prices.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    amount: formatRegistrationUsdInput(
                                      parsed.amountCents,
                                    ),
                                  }
                                : item,
                            ),
                          });
                        }}
                      />
                      </span>
                    </label>
                    <label className="flex min-h-11 items-center text-sm text-muted-foreground">
                      <input
                        className="mr-2 accent-primary"
                        type="checkbox"
                        checked={price.active}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            prices: draft.prices.map((item, i) =>
                              i === index
                                ? { ...item, active: event.target.checked }
                                : item,
                            ),
                          })
                        }
                      />
                      Active
                    </label>
                    <button
                      className={`${button} px-2 text-destructive hover:bg-destructive/10`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          prices: draft.prices.filter((_, i) => i !== index),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </fieldset>
            </AdminPanel>

</div>
<div hidden={section !== undefined && section !== "waiver"} data-registration-section="waiver"><AdminPanel className="overflow-hidden p-0 sm:p-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-4">
                <h3 className="font-body text-base font-semibold">
                  Waiver and consent
                </h3>
                <p className="text-sm text-muted-foreground">
                  Seeded from the standard template with your club name
                </p>
                <button
                  type="button"
                  onClick={() => setWaiverExpanded((value) => !value)}
                  aria-expanded={waiverExpanded}
                  className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {waiverExpanded ? "Collapse" : "Expand"}
                  {waiverExpanded ? (
                    <ChevronUp aria-hidden="true" className="size-3.5" />
                  ) : (
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                  )}
                </button>
              </div>
              {waiverExpanded && (
                <div className="p-5">
                  <textarea
                    disabled={saving || readOnly}
                    aria-label="Waiver and consent"
                    aria-describedby="registration-waiver-guidance"
                    className={`${input} min-h-64`}
                    value={draft.waiver}
                    onChange={(event) =>
                      setDraft({ ...draft, waiver: event.target.value })
                    }
                  />
                  <p
                    id="registration-waiver-guidance"
                    className="mt-2 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2.5 text-sm leading-relaxed text-warning"
                  >
                    {REGISTRATION_WAIVER_LEGAL_HINT}
                  </p>
                </div>
              )}
            </AdminPanel>

</div>
</>;
}
