import { useState } from "react";
import { createRoot } from "react-dom/client";
import RegistrationsPage from "@/app/admin/(protected)/registrations/page";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { ClubTimeZoneProvider } from "@/components/ClubTimeZoneProvider";
import { AdminThemeProvider } from "@/components/admin/AdminThemeProvider";
import { AdminPortalProvider } from "@/components/admin/AdminPortalProvider";
import { UnsavedGuardProvider } from "@/components/admin/ui/UnsavedGuardDialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { CLASSIC_ADMIN_PORTAL } from "@/lib/admin-portal";
import guided from "@/components/admin/AdminGuided.module.css";
import "@/styles/globals.css";
import "./fixture.css";
const query = new URLSearchParams(location.search);
const theme = query.get("theme") === "dark" ? "dark" : "light";
const club = { id: "11111111-1111-4111-8111-111111111111", name: "Alpha FC", slug: "alpha", primaryDomain: "alpha.localhost", lifecycle: "active", publicAccess: "live", kind: "test", tier: "pro", role: "owner", stripePriceId: null, primaryColor: null, secondaryColor: null, presentationTemplateKey: query.has("unsupported") ? "clubhouse@1" : "academy@1", storeEnabled: true, publicPageVisibility: {} } as const;
function Fixture() {
  const [destination, setDestination] = useState("Registrations");
  return <AdminThemeProvider initialTheme={theme}><ClubContextProvider club={club}><ClubTimeZoneProvider timeZone="America/Los_Angeles"><ClubBrandingProvider initialBranding={{ logoPath: "", inverseLogoPath: "", footerTagline: "Our community" }}><AdminPortalProvider isOwner={false} settings={{ ...CLASSIC_ADMIN_PORTAL, portal: query.has("legacy") ? "reimagined" : "classic", timeZoneConfirmed: true }}><UnsavedGuardProvider navigate={setDestination}><SidebarProvider><main className={`admin-portal ${guided.portal} cl24-fixture`}><nav><a href="/admin/roster">Roster</a><output aria-label="Current page">{destination}</output></nav><RegistrationsPage /></main></SidebarProvider></UnsavedGuardProvider></AdminPortalProvider></ClubBrandingProvider></ClubTimeZoneProvider></ClubContextProvider></AdminThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
