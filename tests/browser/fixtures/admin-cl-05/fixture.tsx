import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import guided from "@/components/admin/AdminGuided.module.css";
import { UnsavedGuardProvider } from "@/components/admin/ui/UnsavedGuardDialog";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import "@/styles/globals.css";

function Editor({ onNavigate }: { onNavigate: (label: string) => void }) {
  const [value, setValue] = useState("Original");
  const [savedValue, setSavedValue] = useState("Original");
  const [saveCount, setSaveCount] = useState(0);
  const [discardCount, setDiscardCount] = useState(0);
  const [failSave, setFailSave] = useState(false);
  const [nativeExportCount, setNativeExportCount] = useState(0);
  const [signOutCount, setSignOutCount] = useState(0);
  const requestNavigation = useUnsavedGuard({
    dirty: value !== savedValue,
    edited: "homepage carousel sponsor logos",
    onSave: async () => {
      setSaveCount((count) => count + 1);
      if (failSave) return false;
      setSavedValue(value);
      return true;
    },
    onDiscard: () => {
      setDiscardCount((count) => count + 1);
      setValue(savedValue);
    },
  });

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <h1 className="text-xl font-semibold">Classic admin unsaved guard</h1>
      <nav aria-label="Primary admin navigation" className="mt-4 flex gap-4">
        <a
          href="/admin/roster"
          onClick={(event) => {
            if (event.defaultPrevented) return;
            event.preventDefault();
            onNavigate("Roster");
          }}
        >Roster</a>
        <a
          href="/admin/schedule"
          onClick={(event) => {
            if (event.defaultPrevented) return;
            event.preventDefault();
            onNavigate("Schedule");
          }}
        >Schedule</a>
      </nav>
      <label className="mt-8 grid max-w-sm gap-2">
        Sponsor name
        <input className="h-11 rounded border border-border bg-background px-3" value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <button
        type="button"
        className="mt-4 h-11 rounded border border-border px-4"
        onClick={(event) => requestNavigation({
          kind: "switch",
          label: "Footer logos",
          continue: () => onNavigate("Footer logos"),
          opener: event.currentTarget,
        })}
      >Switch placement</button>
      <a
        href="/api/admin/registrations/export?formId=fixture"
        onClick={(event) => {
          event.preventDefault();
          setNativeExportCount((count) => count + 1);
        }}
      >Export CSV</a>
      <button
        type="button"
        onClick={(event) => requestNavigation({
          kind: "page",
          label: "Sign in",
          continue: () => setSignOutCount((count) => count + 1),
          opener: event.currentTarget,
        })}
      >Sign out</button>
      <label className="mt-4 flex items-center gap-2">
        <input type="checkbox" checked={failSave} onChange={(event) => setFailSave(event.target.checked)} />
        Fail save
      </label>
      <div className="mt-6 grid gap-2">
        <output aria-label="Save count">{saveCount}</output>
        <output aria-label="Native export count">{nativeExportCount}</output>
        <output aria-label="Sign out count">{signOutCount}</output>
        <output aria-label="Discard count">{discardCount}</output>
        <output aria-label="Dirty">{String(value !== savedValue)}</output>
      </div>
    </div>
  );
}

function Fixture() {
  const [destination, setDestination] = useState("Sponsors");
  const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
  return (
    <main className="admin-theme" data-admin-theme={theme}>
      <UnsavedGuardProvider navigate={(href) => setDestination(href === "/admin/roster" ? "Roster" : "Schedule")}>
        <div className={`admin-portal ${guided.portal}`}>
          <output aria-label="Current page">{destination}</output>
          <Editor onNavigate={setDestination} />
        </div>
      </UnsavedGuardProvider>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);

