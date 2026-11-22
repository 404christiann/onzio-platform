import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Chart } from "chart.js";
import ClassicAnalyticsPage from "@/components/admin/ClassicAnalyticsPage";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { AdminThemeProvider, useAdminTheme } from "@/components/admin/AdminThemeProvider";
import { resolveAdminTheme } from "@/lib/admin-theme";
import "@/styles/globals.css";
import "./fixture.css";

const theme = resolveAdminTheme(document.cookie.split("; ").find((entry) => entry.startsWith("onzio-admin-theme="))?.split("=")[1]);
const club = { id: "11111111-1111-4111-8111-111111111111", name: "Alpha FC", slug: "alpha", primaryDomain: "alpha-onzio.vercel.app", lifecycle: "active", publicAccess: "live", kind: "test", tier: "pro", role: "owner", stripePriceId: null, primaryColor: null, secondaryColor: null, presentationTemplateKey: null, storeEnabled: false } as const;
declare global { interface Window { __cl20Chart: () => unknown; } }
let previousCanvas: HTMLCanvasElement | null = null;
window.__cl20Chart = () => {
  const canvas = document.querySelector("canvas") ?? previousCanvas;
  previousCanvas = canvas;
  const chart = canvas ? Chart.getChart(canvas) : undefined;
  return chart ? { id: chart.id, labels: chart.data.labels, values: chart.data.datasets[0].data, color: chart.data.datasets[0].borderColor, animation: chart.options.animation } : null;
};
function Workspace() {
  const [open, setOpen] = useState(true);
  const { toggleTheme } = useAdminTheme();
  return <><div className="flex gap-4 p-2"><button type="button" onClick={() => setOpen(!open)}>{open ? "Close fixture" : "Open fixture"}</button><button type="button" onClick={toggleTheme}>Toggle theme</button></div>{open && <main className="admin-portal cl20-fixture"><ClassicAnalyticsPage /></main>}</>;
}
createRoot(document.getElementById("root")!).render(
  <AdminThemeProvider initialTheme={theme}>
    <ClubContextProvider club={club}>
      <Workspace />
    </ClubContextProvider>
  </AdminThemeProvider>,
);
