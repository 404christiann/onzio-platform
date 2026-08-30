"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { useMemo, useState } from "react";
import SignatureInput from "@/components/registration/SignatureInput";
import {
  REGISTRATION_PARTICIPANT_QUESTION,
  registrationFieldAppliesToParticipant,
  type RegistrationParticipantType,
} from "@/lib/registration-fields";
import type { PublicRegistrationForm } from "@/lib/registration-public";
import { formatRegistrationPrice } from "@/lib/registration-public";
import { registrationSubmissionErrorMessage } from "@/lib/registration-submission-error";

type RegistrationAnswer = string | number | boolean;

type Props = {
  form: PublicRegistrationForm;
  open: boolean;
  onClose: () => void;
};

function initialAnswers(
  form: PublicRegistrationForm,
): Record<string, RegistrationAnswer> {
  return Object.fromEntries(
    form.fields
      .filter((field) => field.type === "checkbox")
      .map((field) => [field.key, false]),
  );
}

function inputType(type: PublicRegistrationForm["fields"][number]["type"]) {
  switch (type) {
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "date":
      return "date";
    case "number":
      return "number";
    default:
      return "text";
  }
}

function textInputValue(
  value: RegistrationAnswer | undefined,
): string | number {
  return typeof value === "string" || typeof value === "number" ? value : "";
}

function initialParticipantType(
  form: PublicRegistrationForm,
): RegistrationParticipantType | null {
  if (form.participantMode === "minor_only") return "minor";
  if (form.participantMode === "adult_only") return "adult";
  return null;
}

export default function RegisterModal({ form, open, onClose }: Props) {
  const emptyAnswers = useMemo(() => initialAnswers(form), [form]);
  const [answers, setAnswers] =
    useState<Record<string, RegistrationAnswer>>(emptyAnswers);
  const [participantType, setParticipantType] =
    useState<RegistrationParticipantType | null>(() =>
      initialParticipantType(form),
    );
  const [priceOptionId, setPriceOptionId] = useState(form.prices[0]?.id ?? "");
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const activeFields = useMemo(
    () =>
      participantType
        ? form.fields.filter((field) =>
            registrationFieldAppliesToParticipant(field, participantType),
          )
        : [],
    [form.fields, participantType],
  );

  const chooseParticipantType = (nextType: RegistrationParticipantType) => {
    setParticipantType(nextType);
    setAnswers((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => {
          const definition = form.fields.find((field) => field.key === key);
          return (
            !definition ||
            registrationFieldAppliesToParticipant(definition, nextType)
          );
        }),
      ),
    );
  };

  const dismiss = () => {
    if (submitting) return;
    setError(null);
    onClose();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!participantType) {
      setError("REGISTRATION_PARTICIPANT_TYPE_REQUIRED");
      return;
    }
    const missingRequiredSignature = activeFields.some(
      (field) =>
        field.type === "signature" && field.required && !answers[field.key],
    );
    if (missingRequiredSignature) {
      setError("REGISTRATION_FIELD_REQUIRED");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formSlug: form.slug,
          priceOptionId,
          participantType,
          answers,
          waiverAccepted,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        confirmationUrl?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "REGISTRATION_SUBMISSION_FAILED");
      const destination = payload.checkoutUrl ?? payload.confirmationUrl;
      if (!destination) throw new Error("REGISTRATION_REDIRECT_MISSING");
      window.location.assign(destination);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "REGISTRATION_SUBMISSION_FAILED",
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={dismiss} className="relative z-[120]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/65 backdrop-blur-sm duration-200 data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-5">
        <DialogPanel
          transition
          className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl duration-200 data-closed:translate-y-6 data-closed:opacity-0 sm:h-auto sm:max-h-[min(760px,calc(100dvh-40px))] sm:max-w-2xl sm:rounded-2xl sm:data-closed:scale-[0.98]"
        >
          <div className="flex items-start justify-between border-b border-black/10 px-5 py-4 sm:px-7">
            <div className="pr-5">
              <p className="font-display text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--color-red)]">
                Registration
              </p>
              <DialogTitle className="mt-1 font-display text-2xl font-black uppercase leading-none text-[var(--color-black)]">
                {form.title}
              </DialogTitle>
            </div>
            <button
              type="button"
              onClick={dismiss}
              disabled={submitting}
              className="mt-0.5 grid size-9 place-items-center rounded-full border border-black/15 text-lg text-[var(--color-black)] disabled:opacity-50"
              aria-label="Close registration"
            >
              <span aria-hidden>×</span>
            </button>
          </div>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              {form.description && (
                <p className="mb-6 font-body text-sm leading-relaxed text-black/65">
                  {form.description}
                </p>
              )}
              {form.participantMode === "both" && (
                <fieldset className="mb-6 rounded-lg border border-black/15 p-4">
                  <legend className="px-1 font-display text-xs font-bold uppercase tracking-wide text-black/70">
                    {REGISTRATION_PARTICIPANT_QUESTION} *
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(["minor", "adult"] as const).map((option) => (
                      <label
                        key={option}
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-black/15 px-3 py-2.5 has-[:checked]:border-[var(--color-red)] has-[:checked]:bg-[var(--color-red)]/5"
                      >
                        <input
                          type="radio"
                          name="participant-type"
                          required
                          value={option}
                          checked={participantType === option}
                          onChange={() => chooseParticipantType(option)}
                          className="size-4 accent-[var(--color-red)]"
                        />
                        <span className="font-body text-sm font-medium capitalize text-black">
                          {option}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {activeFields.map((field) => (
                  <label
                    key={field.key}
                    className={
                      field.type === "checkbox"
                        ? "sm:col-span-2 flex items-start gap-3 rounded-lg border border-black/10 p-3"
                        : "grid gap-1.5"
                    }
                  >
                    {field.type === "checkbox" ? (
                      <>
                        <input
                          type="checkbox"
                          required={field.required}
                          checked={answers[field.key] === true}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [field.key]: event.target.checked,
                            }))
                          }
                          className="mt-0.5 size-4 accent-[var(--color-red)]"
                        />
                        <span className="font-body text-sm text-black/80">
                          {field.label}
                          {field.required ? " *" : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-display text-xs font-bold uppercase tracking-wide text-black/70">
                          {field.label}
                          {field.required ? " *" : ""}
                        </span>
                        {field.type === "dropdown" ? (
                          <select
                            required={field.required}
                            value={
                              typeof answers[field.key] === "string"
                                ? String(answers[field.key])
                                : ""
                            }
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            className="min-h-11 rounded-md border border-black/20 bg-white px-3 font-body text-base text-black outline-none focus:border-[var(--color-red)] focus:ring-1 focus:ring-[var(--color-red)]"
                          >
                            <option value="">Select one</option>
                            {(field.options ?? []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : field.type === "long_text" ? (
                          <textarea
                            required={field.required}
                            value={
                              typeof answers[field.key] === "string"
                                ? String(answers[field.key])
                                : ""
                            }
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            className="min-h-28 resize-y rounded-md border border-black/20 bg-white px-3 py-2 font-body text-base text-black outline-none focus:border-[var(--color-red)] focus:ring-1 focus:ring-[var(--color-red)]"
                          />
                        ) : field.type === "signature" ? (
                          <SignatureInput
                            id={`registration-${field.key}`}
                            value={
                              typeof answers[field.key] === "string"
                                ? String(answers[field.key])
                                : ""
                            }
                            onChange={(value) =>
                              setAnswers((current) => ({
                                ...current,
                                [field.key]: value,
                              }))
                            }
                          />
                        ) : (
                          <input
                            required={field.required}
                            type={inputType(field.type)}
                            value={textInputValue(answers[field.key])}
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [field.key]:
                                  field.type === "number" &&
                                  event.target.value !== ""
                                    ? Number(event.target.value)
                                    : event.target.value,
                              }))
                            }
                            className="min-h-11 rounded-md border border-black/20 bg-white px-3 font-body text-base text-black outline-none focus:border-[var(--color-red)] focus:ring-1 focus:ring-[var(--color-red)]"
                          />
                        )}
                      </>
                    )}
                  </label>
                ))}
              </div>

              <fieldset className="mt-7">
                <legend className="font-display text-xs font-bold uppercase tracking-wide text-black/70">
                  Registration option
                </legend>
                <div className="mt-2 grid gap-2">
                  {form.prices.map((price) => (
                    <label
                      key={price.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-black/15 px-4 py-3 has-[:checked]:border-[var(--color-red)] has-[:checked]:bg-[var(--color-red)]/5"
                    >
                      <span className="font-body text-sm font-medium text-black">
                        {price.label}
                      </span>
                      <span className="flex items-center gap-3 font-display text-sm font-bold text-black">
                        {formatRegistrationPrice(price.amountCents)}
                        <input
                          type="radio"
                          name="registration-price"
                          value={price.id}
                          checked={priceOptionId === price.id}
                          onChange={() => setPriceOptionId(price.id)}
                          className="size-4 accent-[var(--color-red)]"
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="mt-7 flex items-start gap-3 rounded-lg bg-black/[0.035] p-4">
                <input
                  type="checkbox"
                  required
                  checked={waiverAccepted}
                  onChange={(event) => setWaiverAccepted(event.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-red)]"
                />
                <span className="font-body text-sm leading-relaxed text-black/75">
                  {form.waiverText}
                </span>
              </label>
              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-md bg-red-50 px-3 py-2 font-body text-sm text-red-800"
                >
                  {registrationSubmissionErrorMessage(error)}
                </p>
              )}
            </div>

            <div className="border-t border-black/10 bg-white px-5 py-4 sm:px-7">
              <button
                type="submit"
                disabled={
                  submitting ||
                  !participantType ||
                  !priceOptionId ||
                  !waiverAccepted
                }
                className="min-h-12 w-full rounded-md bg-[var(--color-red)] px-5 font-display text-sm font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {submitting
                  ? "Submitting registration…"
                  : "Submit registration"}
              </button>
              <p className="mt-2 text-center font-body text-xs text-black/50">
                Paid registrations are confirmed after payment is processed.
              </p>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
