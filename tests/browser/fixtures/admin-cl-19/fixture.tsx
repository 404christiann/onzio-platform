import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { AdminThemeProvider } from "@/components/admin/AdminThemeProvider";
import { PaymentStatusCard, PaymentStatusSkeleton } from "@/components/admin/payments/PaymentStatusCard";
import { resolveAdminTheme } from "@/lib/admin-theme";
import type { PaymentsUiState } from "@/lib/stripe-subscription-state";
import "@/styles/globals.css";
import "./fixture.css";

const states: Record<string, PaymentsUiState> = {
  no_subscription: { state: "no_subscription" },
  active: { state: "active", periodEndsAt: "2026-12-01T08:00:00Z" },
  active_canceling: { state: "active_canceling", periodEndsAt: "2026-12-01T08:00:00Z" },
  payment_failed: { state: "payment_failed" },
  grace: { state: "grace", graceEndsAt: "2026-11-19T08:00:00Z", daysRemaining: 4 },
  terminal: { state: "terminal" },
};
const query = new URLSearchParams(location.search);
const mode = query.get("mode");
const clubName = mode === "long"
  ? "Fort Wayne Atletico Internacional Sociedad Deportiva y Cultural de Futbol Juvenil Academy"
  : "Alpha FC";
const priceLabel = mode === "none" ? null : mode === "long" ? "$12,500.00/mo" : "$85.00/mo";
const uiState = states[query.get("state") ?? "active"] ?? states.active;
const kind = query.get("kind");
const clubKind = kind === "demo" || kind === "test" ? kind : "customer";
const theme = resolveAdminTheme(document.cookie.split("; ").find((entry) => entry.startsWith("onzio-admin-theme="))?.split("=")[1]);

declare global {
  interface Window { __cl19Release?: () => void; }
}

function Fixture() {
  const hold = query.get("hold") === "1";
  const [ready, setReady] = useState(!hold);
  useEffect(() => {
    window.__cl19Release = () => setReady(true);
    return () => { delete window.__cl19Release; };
  }, []);

  return (
    <AdminThemeProvider initialTheme={theme}>
      <main className="admin-portal cl19-fixture">
        <AdminPage className="max-w-4xl" data-payments-page="">
          <AdminPageHeader title="Payments" description={ready ? `${clubName} subscription and billing.` : "Subscription and billing."} />
          <div data-view-model-state={ready ? "ready" : "unknown"}>
            {ready
              ? <PaymentStatusCard uiState={uiState} clubName={clubName} priceLabel={priceLabel} clubKind={clubKind} />
              : <PaymentStatusSkeleton />}
          </div>
        </AdminPage>
      </main>
    </AdminThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
