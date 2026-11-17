import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import guided from "@/components/admin/AdminGuided.module.css";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import {
  AdminDialog,
  AdminDialogFields,
  AdminDialogFooter,
  AdminDialogSection,
} from "@/components/admin/ui/AdminDialog";
import { AdminSaveButton } from "@/components/admin/ui/AdminSaveButton";
import { Button } from "@/components/ui/button";
import "@/styles/globals.css";

const sizes = ["sm", "md", "lg", "xl"] as const;
type Modal = (typeof sizes)[number] | "confirm" | "busy" | "manual" | "legacy";

const longTitle = "Edit the full registration details for Diverse City Football Academy";
const fields = [
  "Club name", "Contact name", "Contact email", "Contact phone",
  "League name", "Competition name", "Registration URL", "Sponsor URL",
  "Mailing address", "Billing address", "Venue address", "Location details",
  "Start date", "End date", "Season name", "Registration notes",
  "Alternate email", "Alternate phone", "Alternate venue", "Venue notes",
  "Uniform supplier", "Equipment supplier", "Parking directions", "Emergency contact",
];

function Fixture() {
  const [modal, setModal] = useState<Modal | null>(null);
  const [lastAction, setLastAction] = useState("none");
  const [cancelCount, setCancelCount] = useState(0);
  const initialFocus = useRef<HTMLInputElement>(null);
  const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
  const dismiss = () => {
    setCancelCount((count) => count + 1);
    setLastAction("cancelled");
    setModal(null);
  };
  const record = (action: string) => {
    setLastAction(action);
    setModal(null);
  };

  return (
    <main className="admin-theme" data-admin-theme={theme}>
      <div className={`admin-portal min-h-screen bg-background p-4 text-foreground ${guided.portal}`}>
        <h1 className="text-xl font-semibold">Classic admin dialogs</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {sizes.map((size) => (
            <Button key={size} onClick={() => setModal(size)}>Open {size}</Button>
          ))}
          <Button onClick={() => setModal("confirm")}>Open confirmation</Button>
          <Button onClick={() => setModal("busy")}>Open busy confirmation</Button>
          <Button onClick={() => setModal("manual")}>Open explicit close</Button>
          <Button onClick={() => setModal("legacy")}>Open legacy modal</Button>
        </div>
        <div className="mt-4 grid gap-2">
          <output aria-label="Last dialog action">{lastAction}</output>
          <output aria-label="Cancel count">{cancelCount}</output>
        </div>
        {sizes.map((size) => (
          <AdminDialog
            key={size}
            open={modal === size}
            onClose={dismiss}
            title={longTitle}
            eyebrow="Registration"
            size={size}
            initialFocus={initialFocus}
            footer={
              <AdminDialogFooter
                primary={<AdminSaveButton state="dirty" onSave={() => record("saved")} />}
                status={size !== "xl" && "Unsaved changes"}
                destructive={size === "xl" && (
                  <Button variant="destructive" onClick={() => record("removed")}>Remove</Button>
                )}
              >
                <Button variant="outline" onClick={dismiss}>Cancel</Button>
              </AdminDialogFooter>
            }
          >
            <AdminDialogSection title="Registration details">
              <AdminDialogFields>
                {fields.map((name, index) => (
                  <label key={name} className="grid gap-1 text-sm">
                    {name}
                    <input
                      ref={index === 0 && modal === size ? initialFocus : undefined}
                      className="h-10 min-w-0 rounded border border-border bg-background px-2"
                      defaultValue={index === 0 ? "Diverse City Football Academy" : undefined}
                    />
                  </label>
                ))}
              </AdminDialogFields>
            </AdminDialogSection>
          </AdminDialog>
        ))}
        <AdminConfirmDialog
          open={modal === "confirm" || modal === "busy"}
          title="Remove club access?"
          confirmLabel="Remove access"
          destructive
          busy={modal === "busy"}
          onCancel={dismiss}
          onConfirm={() => record("confirmed")}
        >
          <p>This member will lose access to the club’s admin tools.</p>
        </AdminConfirmDialog>
        <AdminDialog
          open={modal === "manual"}
          onClose={dismiss}
          title="Explicit close"
          dismissOnEscape={false}
          dismissOnBackdrop={false}
        >
          <p>Close this dialog with its Close button.</p>
        </AdminDialog>
        <AdminModal
          open={modal === "legacy"}
          onClose={dismiss}
          aria-label="Legacy modal"
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded bg-card p-4"
        >
          <button type="button" onClick={dismiss}>Dismiss legacy modal</button>
        </AdminModal>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
