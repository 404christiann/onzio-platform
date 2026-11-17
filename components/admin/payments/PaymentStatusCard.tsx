"use client";

import { FormEvent, useState, type ReactNode } from "react";

import { AdminBar } from "@/components/admin/ui/AdminBar";
import { AdminPendingButton } from "@/components/admin/ui/AdminPendingButton";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { GRACE_MS, type PaymentsUiState } from "@/lib/stripe-subscription-state";
import { cn } from "@/lib/utils";

import styles from "./PaymentStatusCard.module.css";

const SUPPORT_EMAIL = "onziofutbol@gmail.com";
const DAY_MS = 86_400_000;
const GRACE_DAYS = Math.round(GRACE_MS / DAY_MS);

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Whole days until `iso`, matching `grace`'s Math.ceil rounding in
 *  lib/stripe-subscription-state.ts. Null when the date can't be parsed. */
function daysUntil(iso: string): number | null {
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  return Math.max(0, Math.ceil((target - Date.now()) / DAY_MS));
}

type ParsedPrice = {
  prefix: string;
  suffix: string;
  value: number;
  decimals: number;
};

function parsePriceLabel(label: string): ParsedPrice | null {
  const match = label.match(/\d[\d,]*(?:\.\d+)?/);
  if (!match || match.index === undefined) return null;
  const raw = match[0];
  const value = Number.parseFloat(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const dot = raw.indexOf(".");
  return {
    prefix: label.slice(0, match.index),
    suffix: label.slice(match.index + raw.length),
    value,
    decimals: dot === -1 ? 0 : raw.length - dot - 1,
  };
}

function formatAmount(value: number, decimals: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function PriceDisplay({ label }: { label: string }) {
  const parsed = parsePriceLabel(label);
  return (
    <p className={styles.price} data-payments-price="">
      {parsed ? (
        <>
          {parsed.prefix}{formatAmount(parsed.value, parsed.decimals)}
          <span className={styles.priceUnit}>{parsed.suffix}</span>
        </>
      ) : label}
    </p>
  );
}

function SupportEmailLink() {
  return <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.supportLink}>{SUPPORT_EMAIL}</a>;
}

// Every contract code the billing routes can return, mapped to a message an
// owner can act on. Codes must never reach the screen raw: before this map, a
// configuration fault navigated a paying customer's browser to raw JSON.
// Mirrors MEMBERSHIP_ERROR_MESSAGES in app/admin/(protected)/members/page.tsx.
const BILLING_ERROR_MESSAGES = new Map<string, string>([
  [
    "AUTHENTICATION_REQUIRED",
    "You're signed out. Sign in again, then retry.",
  ],
  [
    "SESSION_EXPIRED",
    "Your session expired — sign in again and retry.",
  ],
  ["MFA_REQUIRED", "Sign in again to confirm it's you, then retry."],
  ["OWNER_REQUIRED", "Only the club owner can manage billing."],
  [
    "MEMBERSHIP_REQUIRED",
    "You're no longer on this club's team. Refresh the page, or contact Onzio if this looks wrong.",
  ],
  [
    "MEMBERSHIP_INACTIVE",
    "Your administrator access has been removed. Contact the club owner if this looks wrong.",
  ],
  [
    "CLUB_ARCHIVED",
    `This club has been archived, so billing can't be changed here. Contact Onzio at ${SUPPORT_EMAIL}.`,
  ],
  [
    "CLUB_INACTIVE",
    `This club isn't active right now, so billing can't be changed here. Contact Onzio at ${SUPPORT_EMAIL}.`,
  ],
  [
    "UNKNOWN_TENANT",
    "We couldn't match this address to a club. Reload the page, and contact Onzio if it keeps happening.",
  ],
  [
    "STRIPE_CUSTOMER_REQUIRED",
    `We couldn't find this club's billing account. Nothing was charged — contact Onzio at ${SUPPORT_EMAIL}.`,
  ],
  [
    "BILLING_NOT_REQUIRED",
    "This club doesn't require a paid subscription, so there's nothing to set up.",
  ],
  [
    "STRIPE_PRICE_REQUIRED",
    `This club's subscription price hasn't been set up yet. Contact Onzio at ${SUPPORT_EMAIL} to finish setup.`,
  ],
  [
    "CHECKOUT_ATTEMPT_INVALID",
    "We couldn't start checkout from this session. Sign in again, then retry.",
  ],
  // The four shared configuration faults keep distinct codes server-side (the
  // DCFC-701 discipline); the owner-facing sentence is the same because the
  // fix is always on Onzio's side.
  [
    "STRIPE_CONFIGURATION_MISSING",
    `Billing isn't fully set up on our side right now. Your subscription is unaffected — contact Onzio at ${SUPPORT_EMAIL}.`,
  ],
  [
    "STRIPE_PORTAL_CONFIGURATION_MISSING",
    `Billing isn't fully set up on our side right now. Your subscription is unaffected — contact Onzio at ${SUPPORT_EMAIL}.`,
  ],
  [
    "STRIPE_MODE_MISMATCH",
    `Billing isn't fully set up on our side right now. Your subscription is unaffected — contact Onzio at ${SUPPORT_EMAIL}.`,
  ],
  [
    "STRIPE_ENVIRONMENT_INVALID",
    `Billing isn't fully set up on our side right now. Your subscription is unaffected — contact Onzio at ${SUPPORT_EMAIL}.`,
  ],
]);

function billingErrorMessage(code: unknown, fallback: string) {
  if (typeof code !== "string") return fallback;
  return BILLING_ERROR_MESSAGES.get(code) ?? fallback;
}

/** Calls a billing route with fetch and navigates to the returned Stripe URL,
 *  so a failure shows a friendly message here instead of the browser landing
 *  on the route's raw JSON error body. The reimagined Payments page (ADMIN-RE-20)
 *  reuses this form as is: `className` and `messageClassName` only restyle it, and
 *  `children` may be a function that learns whether the request is in flight. */
export function BillingActionForm({
  endpoint,
  fallbackMessage,
  children,
  className = "mt-6",
  messageClassName = "mt-3 font-body text-sm text-destructive",
}: {
  endpoint: "/api/stripe/portal" | "/api/stripe/checkout";
  fallbackMessage: string;
  children: React.ReactNode | ((state: { pending: boolean }) => React.ReactNode);
  className?: string;
  messageClassName?: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const body: unknown = await response.json().catch(() => ({}));
      const record =
        body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      if (!response.ok || typeof record.url !== "string") {
        setPending(false);
        setMessage(billingErrorMessage(record.error, fallbackMessage));
        return;
      }
      // Stay pending while the browser leaves for Stripe.
      window.location.assign(record.url);
    } catch {
      setPending(false);
      setMessage(fallbackMessage);
    }
  }

  return (
    <form onSubmit={submit} className={className}>
      <fieldset disabled={pending} className="contents">
        {typeof children === "function" ? children({ pending }) : children}
      </fieldset>
      {message && (
        <p role="alert" className={messageClassName}>
          {message}
        </p>
      )}
    </form>
  );
}

/** Same owner-facing fallback sentences the classic card uses, shared so the
 *  two pages can never disagree about what went wrong. */
export const PORTAL_FALLBACK_MESSAGE = `We couldn't open the billing portal. Try again in a minute, or contact Onzio at ${SUPPORT_EMAIL}.`;
export const CHECKOUT_FALLBACK_MESSAGE = `We couldn't start checkout. Nothing was charged — try again in a minute, or contact Onzio at ${SUPPORT_EMAIL}.`;
export { SUPPORT_EMAIL };

type PaymentStatusCardProps = {
  uiState: PaymentsUiState;
  priceLabel: string | null;
  clubName: string;
  clubKind: "customer" | "demo" | "test";
};

type TimelineStep = {
  phase: "done" | "now" | "next";
  title: string;
  detail?: string;
};

type ClassicPaymentsPresentation = {
  label: string;
  tone: "quiet" | "ok" | "warn" | "danger";
  message: ReactNode;
  action: { kind: "checkout" | "portal"; label: string; primary?: boolean } | null;
  steps: TimelineStep[];
};

function presentation({ uiState, priceLabel, clubName, clubKind }: PaymentStatusCardProps): ClassicPaymentsPresentation {
  switch (uiState.state) {
    case "no_subscription":
      if (clubKind !== "customer") {
        return {
          label: "Private preview", tone: "quiet", action: null, steps: [],
          message: <>This {clubKind} club does not require a paid subscription.</>,
        };
      }
      return {
        label: "Private preview", tone: "quiet",
        message: <>{clubName} hasn&apos;t started a paid Onzio subscription yet. Start one to activate billing and keep the club&apos;s site live once it launches.</>,
        action: { kind: "checkout", label: "Start subscription", primary: true },
        steps: [
          { phase: "now", title: "Today", detail: "No paid subscription yet." },
          { phase: "next", title: "After you subscribe", detail: "Billing starts and the club's site stays live once it launches." },
        ],
      };
    case "active": {
      const renewsIn = daysUntil(uiState.periodEndsAt);
      return {
        label: "Active", tone: "ok", message: null,
        action: { kind: "portal", label: "Manage billing" },
        steps: [
          { phase: "done", title: "Subscription active", detail: "Billing is up to date." },
          { phase: "now", title: "Today", detail: renewsIn === null ? "Current period." : `Current period, renews in ${renewsIn} ${renewsIn === 1 ? "day" : "days"}.` },
          { phase: "next", title: renewsIn === null ? "Next renewal" : formatDate(uiState.periodEndsAt), detail: `Renews automatically${priceLabel ? ` for ${priceLabel}` : ""}.` },
        ],
      };
    }
    case "active_canceling":
      return {
        label: "Ending", tone: "warn",
        message: <>Your subscription is scheduled to end on {formatDate(uiState.periodEndsAt)}. Self-serve cancellation changes are disabled — contact Onzio if this should be changed.</>,
        action: { kind: "portal", label: "Manage billing" },
        steps: [
          { phase: "done", title: "Subscription active", detail: "Cancellation is scheduled." },
          { phase: "now", title: "Today", detail: "You still have full access." },
          { phase: "next", title: formatDate(uiState.periodEndsAt), detail: "Subscription ends and content administration goes on hold." },
        ],
      };
    case "payment_failed":
      return {
        label: "Payment failed", tone: "danger",
        message: <>Your latest subscription payment failed. Update your payment method and pay the outstanding invoice in the billing portal, or contact <SupportEmailLink />.</>,
        action: { kind: "portal", label: "Resolve payment", primary: true },
        steps: [
          { phase: "done", title: "Subscription active" },
          { phase: "now", title: "Latest payment failed", detail: "The invoice is outstanding." },
          { phase: "next", title: "Resolve it in the billing portal", detail: "Update your payment method and pay the invoice." },
        ],
      };
    case "grace":
      return {
        label: "Payment overdue", tone: "warn",
        message: <>The subscription payment is overdue. Content editing remains available, and your public site stays live until the grace period ends on {formatDate(uiState.graceEndsAt)}. Update your payment method and pay the outstanding invoice in the billing portal before then — otherwise the public site goes down — or contact <SupportEmailLink />.</>,
        action: { kind: "portal", label: "Update payment method", primary: true },
        steps: [
          { phase: "done", title: "Subscription active" },
          { phase: "done", title: "Payment overdue", detail: "Content editing remains available." },
          { phase: "now", title: "Today", detail: `${uiState.daysRemaining} of ${GRACE_DAYS} days left. The public site stays live.` },
          { phase: "next", title: formatDate(uiState.graceEndsAt), detail: "Grace period ends. The public site goes down if the invoice is unpaid." },
        ],
      };
    case "terminal":
      return {
        label: "Ended", tone: "quiet",
        message: <>Content administration is on hold. Use the Customer Portal to restore billing, or contact <SupportEmailLink />.</>,
        action: { kind: "portal", label: "Manage billing", primary: true },
        steps: [
          { phase: "done", title: "Subscription ended" },
          { phase: "now", title: "Today", detail: "Content administration is on hold." },
          { phase: "next", title: "Restore billing", detail: "Use the Customer Portal to start again." },
        ],
      };
  }
}

function PaymentPanels({
  summary, timeline, tone = "quiet", skeleton = false,
}: {
  summary: ReactNode;
  timeline: ReactNode;
  tone?: ClassicPaymentsPresentation["tone"];
  skeleton?: boolean;
}) {
  return (
    <div className={cn(styles.layout, !timeline && styles.exempt)} data-classic-payments="" data-tone={tone} data-payments-skeleton={skeleton || undefined} aria-hidden={skeleton || undefined}>
      <section className={cn(styles.panel, styles.summary)} aria-label="Onzio subscription" data-payments-summary="">
        {summary}
      </section>
      {timeline && (
        <section className={styles.panel} aria-label="What happens next" data-payments-timeline="">
          <h2 className={styles.eyebrow}>What happens next</h2>
          {timeline}
        </section>
      )}
    </div>
  );
}

export function PaymentStatusCard(props: PaymentStatusCardProps) {
  const { uiState, priceLabel, clubName } = props;
  const view = presentation(props);
  const action = view.action;
  const exempt = uiState.state === "no_subscription" && props.clubKind !== "customer";
  const clubCaption = uiState.state === "active" || uiState.state === "active_canceling"
    ? `${clubName}'s Onzio subscription`
    : clubName;

  return (
    <PaymentPanels
      tone={view.tone}
      summary={
        <>
          <div className={styles.summaryHeading}>
            <h2 className={styles.eyebrow}>Onzio subscription</h2>
            <span className={styles.pill}>{view.label}</span>
          </div>
          {!exempt && priceLabel !== null && <PriceDisplay label={priceLabel} />}
          <p className={styles.club}>{clubCaption}</p>
          {uiState.state === "grace" && (
            <div className={styles.grace}>
              <div className={styles.graceLabel}>
                <span>Grace period</span>
                <span>{uiState.daysRemaining} of {GRACE_DAYS} days left</span>
              </div>
              <AdminBar className={styles.graceBar} fraction={uiState.daysRemaining / GRACE_DAYS} label={`${uiState.daysRemaining} of ${GRACE_DAYS} grace days left`} />
            </div>
          )}
          {exempt && view.message && <p className={styles.message}>{view.message}</p>}
          {action && (
            <BillingActionForm
              endpoint={action.kind === "checkout" ? "/api/stripe/checkout" : "/api/stripe/portal"}
              fallbackMessage={action.kind === "checkout" ? CHECKOUT_FALLBACK_MESSAGE : PORTAL_FALLBACK_MESSAGE}
              className={styles.actionForm}
              messageClassName={styles.problem}
            >
              {({ pending }) => (
                <AdminPendingButton
                  type="submit"
                  variant={action.primary ? "default" : "outline"}
                  className={styles.actionButton}
                  label={action.label}
                  pendingLabel={action.kind === "checkout" ? "Opening checkout…" : "Opening billing…"}
                  pending={pending}
                />
              )}
            </BillingActionForm>
          )}
        </>
      }
      timeline={view.steps.length ? (
        <>
        <ol className={styles.timeline}>
          {view.steps.map((step, index) => (
            <li key={`${index}-${step.title}`} className={styles.step} data-step={step.phase} aria-current={step.phase === "now" ? "step" : undefined}>
              <span className={styles.dot} aria-hidden="true" />
              <div>
                <span className="sr-only">{step.phase === "done" ? "Completed: " : step.phase === "now" ? "Current: " : "Next: "}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                {step.detail && <p className={styles.stepDetail}>{step.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
        {view.message && <p className={styles.message}>{view.message}</p>}
        </>
      ) : null}
    />
  );
}

export function PaymentStatusSkeleton() {
  return (
    <div role="status" aria-label="Loading subscription details">
      <PaymentPanels
        skeleton
        summary={
          <>
            <div className={styles.summaryHeading}>
              <Shimmer className={styles.skeletonEyebrow}>Onzio subscription</Shimmer>
              <Shimmer className={styles.skeletonPill} />
            </div>
            <Shimmer className={styles.skeletonPrice} />
            <Shimmer className={styles.skeletonClub} />
            <Shimmer className={styles.skeletonMessage} />
            <div className={styles.actionForm}><Shimmer className={styles.skeletonAction} /></div>
          </>
        }
        timeline={
          <ol className={styles.timeline}>
            {[0, 1, 2, 3].map((step) => (
              <li className={styles.step} key={step}>
                <Shimmer className={styles.dot} />
                <div className={styles.skeletonStep}>
                  <Shimmer className={styles.skeletonStepTitle} />
                  <Shimmer className={styles.skeletonStepDetail} />
                </div>
              </li>
            ))}
          </ol>
        }
      />
    </div>
  );
}
