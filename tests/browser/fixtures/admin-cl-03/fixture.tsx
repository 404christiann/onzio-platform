import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import AdminSaveFeedback from "@/components/admin/AdminSaveFeedback";
import { AdminSaveActions } from "@/components/admin/ui/AdminSaveButton";
import { useSaveState } from "@/components/admin/ui/useSaveState";
import "@/styles/globals.css";

function Fixture() {
  const [draft, setDraft] = useState("Diverse City FC");
  const [persisted, setPersisted] = useState(draft);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");
  const response = useRef<{ resolve: () => void; reject: () => void } | null>(null);
  const params = new URLSearchParams(window.location.search);
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const { state, save } = useSaveState({
    isDirty: draft !== persisted,
    async onSave() {
      setAttempts((count) => count + 1);
      setError("");
      await new Promise<void>((resolve, reject) => {
        response.current = {
          resolve,
          reject: () => reject(new Error("Could not save.")),
        };
      });
      setPersisted(draft);
    },
  });

  const pillScope = params.get("pill");
  if (pillScope) {
    return (
      <main className="admin-theme" data-admin-theme={theme}>
        <div className={pillScope === "classic" ? "admin-portal" : undefined}>
          <AdminSaveFeedback saving saved={false} />
        </div>
      </main>
    );
  }

  return (
    <main className="admin-theme" data-admin-theme={theme}>
      <div className="admin-portal mx-auto grid min-w-0 gap-6 p-5 font-sans" style={{ maxWidth: 580 }}>
        <h1 className="text-xl font-semibold">Classic admin save</h1>
        <section aria-label="Club details" className="grid gap-4 rounded-xl border border-border bg-card p-4">
          <label className="grid gap-1">
            Club short name
            <input className="rounded border border-border bg-background px-2 py-1" value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <AdminSaveActions
            state={state}
            onSave={() => {
              void save().catch((failure: Error) => setError(failure.message));
            }}
            stackOnMobile={params.has("stack")}
          >
            {(params.has("stack") || params.has("cancel")) && <button type="button" className="h-11 rounded-md border border-border px-3">Cancel</button>}
          </AdminSaveActions>
        </section>
        <section aria-label="Fixture controls" className="grid gap-3 text-sm">
          <div className="flex flex-wrap gap-3">
            <button type="button" className="underline" onClick={() => response.current?.resolve()}>Resolve save</button>
            <button type="button" className="underline" onClick={() => response.current?.reject()}>Reject save</button>
          </div>
          <output aria-label="Save attempts">{attempts}</output>
          <output aria-label="Persisted short name">{persisted}</output>
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
