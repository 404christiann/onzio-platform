import { useState } from "react";
import { createRoot } from "react-dom/client";
import StandingsPage from "@/app/admin/(protected)/standings/page";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { AdminThemeProvider } from "@/components/admin/AdminThemeProvider";
import { AdminPortalProvider } from "@/components/admin/AdminPortalProvider";
import { UnsavedGuardProvider } from "@/components/admin/ui/UnsavedGuardDialog";
import { CLASSIC_ADMIN_PORTAL } from "@/lib/admin-portal";
import guided from "@/components/admin/AdminGuided.module.css";
import "@/styles/globals.css";
import "./fixture.css";
const query = new URLSearchParams(location.search);
const theme = query.get("theme") === "dark" ? "dark" : "light";
const club = { id: "11111111-1111-4111-8111-111111111111", name: "Alpha FC", slug: "alpha", primaryDomain: "alpha.localhost", lifecycle: "active", publicAccess: "live", kind: "test", tier: "pro", role: "owner", stripePriceId: null, primaryColor: null, secondaryColor: null, presentationTemplateKey: query.has("clubhouse") ? "clubhouse@1" : "academy@1", storeEnabled: true } as const;
function Fixture() {
 const [destination,setDestination]=useState("Standings");
 return <AdminThemeProvider initialTheme={theme}><ClubContextProvider club={club}><ClubBrandingProvider initialBranding={{logoPath:"",inverseLogoPath:"",footerTagline:"Our community"}}><AdminPortalProvider isOwner={false} settings={{...CLASSIC_ADMIN_PORTAL,portal:"classic",timeZoneConfirmed:true}}><UnsavedGuardProvider navigate={setDestination}><main className={"admin-portal cl25-fixture " + guided.portal}><nav><a href="/admin/roster">Roster</a><output aria-label="Current page">{destination}</output></nav><StandingsPage /></main></UnsavedGuardProvider></AdminPortalProvider></ClubBrandingProvider></ClubContextProvider></AdminThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
