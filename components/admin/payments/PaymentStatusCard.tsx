"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { animate, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { GRACE_MS, type PaymentsUiState } from "@/lib/stripe-subscription-state";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "onziofutbol@gmail.com";
const DAY_MS = 86_400_000;
const GRACE_DAYS = Math.round(GRACE_MS / DAY_MS);

const CARD_SHELL =
  "rounded-xl border bg-card p-5 text-card-foreground sm:p-7";

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

/** Splits a label like "$75.00/mo" into prefix "$", numeric 75.00, suffix
 *  "/mo" so only the number animates. Null when no parseable number exists. */
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

function AnimatedAmount({ value, decimals }: { value: number; decimals: number }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(() => (reduceMotion ? value : 0));

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  return <>{formatAmount(display, decimals)}</>;
}

function PriceDisplay({ label, animated }: { label: string; animated: boolean }) {
  const parsed = parsePriceLabel(label);
  return (
    <p className="font-display text-5xl font-black leading-none text-foreground">
      {parsed ? (
        <>
          {parsed.prefix}
          {animated ? (
            <AnimatedAmount value={parsed.value} decimals={parsed.decimals} />
          ) : (
            formatAmount(parsed.value, parsed.decimals)
          )}
          <span className="ml-1 font-body text-xl font-medium text-muted-foreground">
            {parsed.suffix}
          </span>
        </>
      ) : (
        label
      )}
    </p>
  );
}

function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SupportEmailLink() {
  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}`}
      className="text-foreground underline underline-offset-2"
    >
      {SUPPORT_EMAIL}
    </a>
  );
}

function PortalForm({ children }: { children: React.ReactNode }) {
  return (
    <form action="/api/stripe/portal" method="POST" className="mt-6">
      {children}
    </form>
  );
}

type PaymentStatusCardProps = {
  uiState: PaymentsUiState;
  priceLabel: string | null;
  clubName: string;
  clubKind: "customer" | "demo" | "test";
};

export function PaymentStatusCard({
  uiState,
  priceLabel,
  clubName,
  clubKind,
}: PaymentStatusCardProps) {
  const reduceMotion = useReducedMotion();

  switch (uiState.state) {
    case "no_subscription":
      return (
        <section className={cn(CARD_SHELL, "border-border")}>
          <Badge className="bg-muted text-muted-foreground">
            Private preview
          </Badge>
          {clubKind !== "customer" ? (
            <p className="mt-5 rounded-lg border border-border bg-background/40 px-4 py-3 font-body text-sm text-muted-foreground">
              This {clubKind} club does not require a paid subscription.
            </p>
          ) : (
            <>
              <p className="mt-5 max-w-prose font-body text-sm leading-relaxed text-muted-foreground">
                {clubName} hasn&apos;t started a paid Onzio subscription yet.
                Start one to activate billing and keep the club&apos;s site
                live once it launches.
              </p>
              <form
                action="/api/stripe/checkout"
                method="POST"
                className="mt-6"
              >
                <Button type="submit" size="lg" className="w-full sm:w-auto">
                  Start subscription
                </Button>
              </form>
            </>
          )}
        </section>
      );

    case "active": {
      const renewsIn = daysUntil(uiState.periodEndsAt);
      return (
        <motion.section
          className={cn(CARD_SHELL, "border-border")}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
              Current period
            </p>
            {renewsIn !== null && (
              <Badge className="bg-success/15 text-success">
                Renews in {renewsIn} {renewsIn === 1 ? "day" : "days"}
              </Badge>
            )}
          </div>
          {priceLabel !== null && (
            <div className="mt-6">
              <PriceDisplay label={priceLabel} animated />
            </div>
          )}
          <p
            className={cn(
              "font-body text-sm text-muted-foreground",
              priceLabel !== null ? "mt-3" : "mt-6",
            )}
          >
            {`${clubName}'s Onzio subscription`}
          </p>
          <PortalForm>
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
            >
              Manage billing
            </Button>
          </PortalForm>
        </motion.section>
      );
    }

    case "active_canceling":
      return (
        <section className={cn(CARD_SHELL, "border-border")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
              Current period
            </p>
            <Badge className="bg-muted text-muted-foreground">
              Ends {formatDate(uiState.periodEndsAt)}
            </Badge>
          </div>
          {priceLabel !== null && (
            <div className="mt-6">
              <PriceDisplay label={priceLabel} animated={false} />
            </div>
          )}
          <p
            className={cn(
              "font-body text-sm text-muted-foreground",
              priceLabel !== null ? "mt-3" : "mt-6",
            )}
          >
            {`${clubName}'s Onzio subscription`}
          </p>
          <p className="mt-4 rounded-lg border border-border bg-background/40 px-4 py-3 font-body text-sm leading-relaxed text-muted-foreground">
            Your subscription is scheduled to end on{" "}
            {formatDate(uiState.periodEndsAt)}. Self-serve cancellation changes
            are disabled — contact Onzio if this should be changed.
          </p>
          <PortalForm>
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
            >
              Manage billing
            </Button>
          </PortalForm>
        </section>
      );

    case "grace": {
      const percentLeft = Math.min(
        100,
        Math.max(0, (uiState.daysRemaining / GRACE_DAYS) * 100),
      );
      return (
        <section className={cn(CARD_SHELL, "border-2 border-warning")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 font-display text-xs font-black uppercase tracking-[0.16em] text-warning">
              <AlertTriangle className="size-4" aria-hidden="true" />
              Payment overdue
            </p>
            <p className="font-body text-xs text-muted-foreground">
              Site stays live
            </p>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between gap-3 font-body text-sm">
              <span className="text-foreground">Grace period</span>
              <span className="text-muted-foreground">
                {uiState.daysRemaining} of {GRACE_DAYS} days left
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-warning"
                style={{ width: `${percentLeft}%` }}
              />
            </div>
          </div>
          <p className="mt-5 max-w-prose font-body text-sm leading-relaxed text-muted-foreground">
            Content editing remains available while payment is overdue, and
            your public site stays live until the grace period ends on{" "}
            {formatDate(uiState.graceEndsAt)}. Update the card in the Customer
            Portal before then — otherwise the public site goes down — or
            contact <SupportEmailLink />.
          </p>
          <PortalForm>
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="w-full border-warning/50 text-warning hover:bg-warning/10 hover:text-warning sm:w-auto"
            >
              Update payment method
            </Button>
          </PortalForm>
        </section>
      );
    }

    case "terminal":
      return (
        <section className={cn(CARD_SHELL, "border-2 border-destructive")}>
          <Badge className="bg-destructive/15 text-destructive">
            <Lock className="size-3.5" aria-hidden="true" />
            Subscription ended
          </Badge>
          <p className="mt-5 max-w-prose font-body text-sm leading-relaxed text-muted-foreground">
            Content administration is on hold. Use the Customer Portal to
            restore billing, or contact <SupportEmailLink />.
          </p>
          <PortalForm>
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
            >
              Manage billing
            </Button>
          </PortalForm>
        </section>
      );
  }
}
