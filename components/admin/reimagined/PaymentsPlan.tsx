"use client";

import Link from "next/link";
import {
  ChevronRight,
  IconPayments,
  IconSuccess,
  IconWarning,
} from "@/components/admin/icons";
import {
  BillingActionForm,
  CHECKOUT_FALLBACK_MESSAGE,
  PORTAL_FALLBACK_MESSAGE,
  SUPPORT_EMAIL,
} from "@/components/admin/payments/PaymentStatusCard";
import type { PaymentsAction, PaymentsView } from "@/lib/admin-payments-view";
import styles from "./payments.module.css";

// ADMIN-RE-20: "Payments and plan" (design: cd-payments, cd-payments-desktop)
// for clubs on the reimagined admin. Only chrome and words are new: the data is
// what the page already resolves, and the buttons are the classic card's own
// BillingActionForm, so the Stripe portal and checkout calls, and the messages
// for every way they can fail, are exactly the ones owners have today.

function SupportLink() {
  return <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
}

function StatusIcon({ tone }: { tone: PaymentsView["status"]["tone"] }) {
  const Glyph = tone === "ok" ? IconSuccess : IconWarning;
  return (
    <span className={styles.statusIcon} aria-hidden="true">
      <Glyph className="size-6" />
    </span>
  );
}

function StatusAction({ action, tone }: { action: PaymentsAction; tone: PaymentsView["status"]["tone"] }) {
  const checkout = action.kind === "checkout";
  return (
    <BillingActionForm
      endpoint={checkout ? "/api/stripe/checkout" : "/api/stripe/portal"}
      fallbackMessage={checkout ? CHECKOUT_FALLBACK_MESSAGE : PORTAL_FALLBACK_MESSAGE}
      className={styles.actionForm}
      messageClassName={styles.problem}
    >
      {({ pending }) => (
        <button type="submit" className={styles.button} data-tone={tone} data-testid="payments-action">
          {pending ? (checkout ? "Starting…" : "Opening…") : action.label}
        </button>
      )}
    </BillingActionForm>
  );
}

export function PaymentsPlan({ view, clubName }: { view: PaymentsView; clubName: string }) {
  const { status, plan, website } = view;
  return (
    <div className={styles.page} data-testid="payments-plan">
      <header className={styles.head}>
        <span className={styles.headIcon} aria-hidden="true">
          <IconPayments className="size-6" />
        </span>
        <h1 className={styles.h1}>Payments and plan</h1>
      </header>
      <p className={styles.sub}>{clubName}</p>

      <div className={styles.stack}>
        <section className={styles.status} data-tone={status.tone} data-testid="payments-status" aria-labelledby="payments-status-title">
          <StatusIcon tone={status.tone} />
          <div className={styles.statusWords}>
            <h2 id="payments-status-title" className={styles.statusTitle}>
              {status.headline}
            </h2>
            <p className={styles.statusLine}>{status.line}</p>
            {status.support ? (
              <p className={styles.statusLine}>
                {status.support} <SupportLink />.
              </p>
            ) : null}
            {status.daysLeft ? (
              <>
                <div className={styles.fact}>
                  <span>Time left</span>
                  <span className={styles.factValue}>{status.daysLeft.label}</span>
                </div>
                <div
                  className={styles.meter}
                  role="progressbar"
                  aria-label="Days left before your website goes down"
                  aria-valuemin={0}
                  aria-valuemax={status.daysLeft.total}
                  aria-valuenow={status.daysLeft.left}
                >
                  <span
                    className={styles.meterFill}
                    style={{ width: `${(status.daysLeft.left / status.daysLeft.total) * 100}%` }}
                  />
                </div>
              </>
            ) : null}
            {status.fact ? (
              <div className={styles.fact}>
                <span>{status.fact.label}</span>
                <span className={styles.factValue}>{status.fact.value}</span>
              </div>
            ) : null}
          </div>
          {status.action ? <StatusAction action={status.action} tone={status.tone} /> : null}
        </section>

        <div className={styles.cards}>
          <div className={styles.col}>
            {plan ? (
              <section className={styles.card} data-testid="payments-plan-card">
                <div className={styles.cardTop}>
                  <h2 className={styles.cardTitle}>{plan.title}</h2>
                  {plan.price ? <span className={styles.price}>{plan.price}</span> : null}
                </div>
                <p className={styles.cardLine}>{plan.line}</p>
              </section>
            ) : null}
            <section className={styles.card} data-testid="payments-website-card">
              <div className={styles.cardTop}>
                <h2 className={styles.cardTitle}>Your website</h2>
                <span className={styles.badge} data-tone={website.tone}>
                  {website.badge}
                </span>
              </div>
              <p className={styles.cardLine}>{website.line}</p>
            </section>
          </div>

          <div className={styles.col}>
            <Link href="/admin/registrations" className={styles.rowLink} data-testid="payments-registration-money">
              <span className={styles.cardTitle}>Registration money</span>
              <span className={styles.rowAside}>
                Set up on Sign-up forms
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </span>
            </Link>
            {view.invoices ? (
              <BillingActionForm
                endpoint="/api/stripe/portal"
                fallbackMessage={PORTAL_FALLBACK_MESSAGE}
                className={styles.rowForm}
                messageClassName={styles.problem}
              >
                {({ pending }) => (
                  <button type="submit" className={styles.rowLink} data-testid="payments-invoices">
                    <span className={styles.cardTitle}>Past invoices</span>
                    <span className={styles.rowAside}>
                      {pending ? "Opening…" : "On the billing page"}
                      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                    </span>
                  </button>
                )}
              </BillingActionForm>
            ) : null}
          </div>
        </div>

        <p className={styles.foot}>
          Questions about billing? Contact Onzio at <SupportLink />.
        </p>
      </div>
    </div>
  );
}
