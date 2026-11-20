import { AdminPanel } from "@/components/admin/AdminPage";
import { AlertCircle,Check } from "@/components/admin/icons";
import { button } from "./registration-editor-model";
import type { RegistrationsEditorModel } from "./useRegistrationsEditor";
export function RegistrationPaymentAccount({ model }: { model: RegistrationsEditorModel }) {
 const { connect } = model;
 return (
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
            <span className="ml-auto inline-flex items-center gap-x-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning-ink">
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
                    className="size-4 flex-none rounded-full bg-warning/10 p-0.5 text-warning-ink"
                  />
                )}
                <span className="text-sm text-foreground">{step.label}</span>
                {!step.done && (
                  <span className="ml-auto text-xs font-semibold text-warning-ink">
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

 );
}
