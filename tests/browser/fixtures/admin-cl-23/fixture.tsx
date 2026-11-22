import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ClassicSponsorsPage } from "@/components/admin/sponsors/ClassicSponsorsPage";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { AdminThemeProvider } from "@/components/admin/AdminThemeProvider";
import { UnsavedGuardProvider } from "@/components/admin/ui/UnsavedGuardDialog";
import guided from "@/components/admin/AdminGuided.module.css";
import { resolveAdminTheme } from "@/lib/admin-theme";
import "@/styles/globals.css";
import "./fixture.css";

const theme = resolveAdminTheme(document.cookie.split("; ").find((entry) => entry.startsWith("onzio-admin-theme="))?.split("=")[1]);
const club = {
  id: "11111111-1111-4111-8111-111111111111", name: "Alpha FC", slug: "alpha", primaryDomain: "alpha.localhost",
  lifecycle: "active", publicAccess: "live", kind: "test", tier: "pro", role: "owner", stripePriceId: null,
  primaryColor: null, secondaryColor: null, presentationTemplateKey: new URLSearchParams(location.search).has("academy") ? "academy@1" : null,
  storeEnabled: false, publicPageVisibility: {},
} as const;
function Fixture() {
  const [destination, setDestination] = useState("Sponsors");
  return <AdminThemeProvider initialTheme={theme}><ClubContextProvider club={club}><UnsavedGuardProvider navigate={setDestination}>
    <main className={`admin-portal ${guided.portal} cl23-fixture`}>
      <nav aria-label="Fixture navigation"><a href="/admin/roster">Roster</a><output aria-label="Current page">{destination}</output></nav>
      <ClassicSponsorsPage />
    </main>
  </UnsavedGuardProvider></ClubContextProvider></AdminThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
