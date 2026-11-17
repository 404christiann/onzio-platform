import { useState, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import TryoutsPageEditor from "@/components/admin/tryouts/TryoutsPageEditor";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { AdminPortalProvider } from "@/components/admin/AdminPortalProvider";
import { AdminThemeProvider, useAdminTheme } from "@/components/admin/AdminThemeProvider";
import { UnsavedGuardProvider } from "@/components/admin/ui/UnsavedGuardDialog";
import { CLASSIC_ADMIN_PORTAL } from "@/lib/admin-portal";
import { resolveAdminTheme } from "@/lib/admin-theme";
import "@/styles/globals.css";
import guided from "@/components/admin/AdminGuided.module.css";
import "./fixture.css";

const params = new URLSearchParams(location.search);
const theme = resolveAdminTheme(document.cookie.split("; ").find((entry) => entry.startsWith("onzio-admin-theme="))?.split("=")[1]);
const club = {
  id: "11111111-1111-4111-8111-111111111111", name: "Alpha FC", slug: "alpha",
  primaryDomain: "alpha.localhost", lifecycle: "active", publicAccess: "live", kind: "test",
  tier: "pro", role: "owner", stripePriceId: null, primaryColor: "#111111", secondaryColor: "#E7001B",
  presentationTemplateKey: params.get("unsupported") === "1" ? "clubhouse@1" : "academy@1", storeEnabled: false,
} as const;
function Workspace() {
  const [open, setOpen] = useState(true);
  const [destination, setDestination] = useState("Tryouts");
  const { toggleTheme } = useAdminTheme();
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented) return;
    event.preventDefault(); setDestination("Roster");
  }
  return <UnsavedGuardProvider navigate={() => setDestination("Roster")}>
    <div className="cl22-controls">
      <a href="/admin/roster" onClick={navigate}>Roster</a>
      <button type="button" onClick={toggleTheme}>Toggle theme</button>
      <button type="button" onClick={() => setOpen(!open)}>{open ? "Close fixture" : "Open fixture"}</button>
      <output aria-label="Current page">{destination}</output>
    </div>
    {open && <main className={"admin-portal cl22-fixture " + guided.portal}><TryoutsPageEditor /></main>}
  </UnsavedGuardProvider>;
}
createRoot(document.getElementById("root")!).render(
  <AdminThemeProvider initialTheme={theme}>
    <AdminPortalProvider settings={{ ...CLASSIC_ADMIN_PORTAL, portal: params.get("portal") === "reimagined" ? "reimagined" : "classic" }} isOwner={false}>
      <ClubContextProvider club={club}><Workspace /></ClubContextProvider>
    </AdminPortalProvider>
  </AdminThemeProvider>,
);
