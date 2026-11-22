import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import HomePageClient from "@/components/HomePageClient";
import type { HomepageEditorSnapshot } from "@/lib/homepage-editor/adapter";
import HomepageEditor from "@/components/admin/homepage/HomepageEditor";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { ClubTimeZoneProvider } from "@/components/ClubTimeZoneProvider";
import { AdminThemeProvider } from "@/components/admin/AdminThemeProvider";
import { AdminPhotoManager } from "@/components/admin/ui/AdminPhotoManager";
import { AdminToastProvider } from "@/components/admin/ui/AdminToast";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import { SidebarProvider } from "@/components/ui/sidebar";
import { UnsavedGuardProvider } from "@/components/admin/ui/UnsavedGuardDialog";
import guided from "@/components/admin/AdminGuided.module.css";
import "@/styles/globals.css";
import "./fixture.css";
const query = new URLSearchParams(location.search);
const theme = query.get("theme") === "dark" ? "dark" : "light";
const club = { id: "11111111-1111-4111-8111-111111111111", name: "Alpha FC", slug: query.has("fixed") ? "rose-city" : "alpha", primaryDomain: "alpha.localhost", lifecycle: "active", publicAccess: "live", kind: "test", tier: "pro", role: "owner", stripePriceId: null, primaryColor: null, secondaryColor: null, presentationTemplateKey: query.has("academy") ? "academy@1" : query.has("clubhouse") ? "clubhouse@1" : null, storeEnabled: true } as const;
function PublicHomepage() {
 const [snapshot, setSnapshot] = useState<HomepageEditorSnapshot | null>(null);
 useEffect(() => { void fetch("/api/admin/homepage").then(response => response.json()).then(setSnapshot); }, []);
 return <div data-cl17-public="">{snapshot && <HomePageClient initialHeroContent={{ ...snapshot.content.hero, id: 1, updated_at: "" }} />}</div>;
}
function DefaultGuardConsumer() {
 const attempts = useRef(0);
 const [count, setCount] = useState(0);
 useUnsavedGuard({ dirty: true, edited: "Default consumer", onSave: async () => { attempts.current++; setCount(attempts.current); return attempts.current > 1; } });
 return <section><h1>Default guard consumer</h1><output aria-label="Save attempts">{count}</output><AdminToastProvider><AdminPhotoManager label="Default photos" collectionId="default" variant="rows" photos={[]} allowedTypes={["image/png"]} maxBytes={15*1024*1024} onChange={() => {}} onUpload={async () => []} /></AdminToastProvider></section>;
}
function Fixture() {
 const [destination, setDestination] = useState("Homepage");
 return <AdminThemeProvider initialTheme={theme}><ClubContextProvider club={club}><ClubTimeZoneProvider timeZone="America/Los_Angeles"><ClubBrandingProvider initialBranding={{ logoPath: "", inverseLogoPath: "", footerTagline: "Our community" }}><UnsavedGuardProvider navigate={setDestination}><SidebarProvider><main className={`admin-portal ${guided.portal} cl17-fixture`}><nav><a href="/admin/roster">Roster</a><output aria-label="Current page">{destination}</output></nav>{query.has("defaultguard") ? <DefaultGuardConsumer /> : query.has("public") ? <PublicHomepage /> : <HomepageEditor />}</main></SidebarProvider></UnsavedGuardProvider></ClubBrandingProvider></ClubTimeZoneProvider></ClubContextProvider></AdminThemeProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
