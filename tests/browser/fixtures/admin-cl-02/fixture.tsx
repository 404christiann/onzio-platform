import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AdminPendingButton } from "@/components/admin/ui/AdminPendingButton";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import "@/styles/globals.css";

function Fixture() {
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [activations, setActivations] = useState(0);
  const [submissions, setSubmissions] = useState(0);
  const theme = new URLSearchParams(window.location.search).get("theme") === "dark" ? "dark" : "light";

  return (
    <main className="admin-theme" data-admin-theme={theme}>
      <div className="admin-portal mx-auto grid min-w-0 max-w-[580px] gap-6 p-5 font-sans">
        <h1 className="text-xl font-semibold">Classic admin controls</h1>
        <section aria-label="Switch states" className="grid gap-4 rounded-xl border border-border bg-card p-4">
          <div className="grid gap-1">
            <span>Registration open</span>
            <AdminSwitch label="Registration open" checked={checked} onCheckedChange={setChecked} />
          </div>
          <div className="grid gap-1">
            <span>Show team photos</span>
            <AdminSwitch label="Show team photos" checked onCheckedChange={() => {}} />
          </div>
          <div className="grid gap-1">
            <span>Show standings</span>
            <span id="standings-help" className="text-sm text-muted-foreground">Public roster setting.</span>
            <AdminSwitch
              label="Show standings"
              checked={false}
              onCheckedChange={setChecked}
              disabled
              disabledReason="Add a season first."
              aria-describedby="standings-help"
            />
          </div>
        </section>
        <form
          aria-label="Pending states"
          className="grid gap-3 rounded-xl border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmissions((count) => count + 1);
          }}
        >
          <label className="grid gap-1">
            Reminder title
            <input className="rounded border border-border bg-background px-2 py-1" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <AdminPendingButton
              type="submit"
              label="Send"
              pendingLabel="Sending reminders…"
              pending={pending}
              onClick={() => {
                setActivations((count) => count + 1);
                setPending(true);
              }}
            />
            <button type="button" onClick={() => setPending(false)} className="px-2 py-1 underline">Resolve</button>
          </div>
          <div>
            <AdminPendingButton label="Preview" pendingLabel="Preparing preview…" pending={false} />
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <output aria-label="Activations">Activations {activations}</output>
            <output aria-label="Submissions">Submissions {submissions}</output>
          </div>
        </form>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
