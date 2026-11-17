import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { Shimmer, ShimmerRefreshText, ShimmerRegion } from "@/components/admin/ui/Shimmer";
import "@/styles/globals.css";
import "./fixture.css";

type Row = { id: number; title: string; detail: string };

const initialRows: Row[] = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  title: index === 0 ? "Season standings" : `Team update ${index + 1}`,
  detail: `Updated by the club · ${index + 1}`,
}));

const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";

function DataCard({ rows }: { rows: Row[] }) {
  return (
    <div className="data-card" data-real-card="">
      {rows.map((row, index) => (
        <div className="data-row" data-real-row="" key={row.id}>
          <span className="row-avatar">{row.id}</span>
          <div className="row-copy">
            {index === 0
              ? <ShimmerRefreshText>{row.title}</ShimmerRefreshText>
              : <span>{row.title}</span>}
            <small>{row.detail}</small>
          </div>
          <span className="row-value">{index + 2}</span>
        </div>
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="data-card" data-skeleton-card="">
      {initialRows.map((row) => (
        <div className="data-row" data-skeleton-row="" key={row.id}>
          <Shimmer className="row-avatar placeholder" />
          <div className="row-copy">
            <Shimmer className="title-placeholder">Season standings</Shimmer>
            <Shimmer className="detail-placeholder">Updated by the club</Shimmer>
          </div>
          <Shimmer className="value-placeholder">12</Shimmer>
        </div>
      ))}
    </div>
  );
}

function Fixture() {
  const [rows, setRows] = useState<Row[] | null>(initialRows);
  const [loading, setLoading] = useState(false);
  const [quietRefresh, setQuietRefresh] = useState(false);
  const requestId = useRef(0);

  async function load(mode: "fast" | "medium" | "slow" | "refresh") {
    const id = ++requestId.current;
    setQuietRefresh(mode === "refresh");
    if (mode !== "refresh") setRows(null);
    setLoading(true);
    try {
      const response = await fetch(`/cl07-data?mode=${mode}&id=${id}`);
      if (!response.ok) throw new Error(`Response ${response.status}`);
      const nextRows = await response.json() as Row[];
      if (id === requestId.current) setRows(nextRows);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setQuietRefresh(false);
      }
    }
  }

  return (
    <main className="admin-theme admin-portal fixture" data-admin-theme={theme}>
      <h1>Classic admin shimmer</h1>
      <p className="subtitle">The title and controls stay in place while the data loads.</p>
      <div className="toolbar">
        <button type="button" onClick={() => void load("fast")}>Load in 100 ms</button>
        <button type="button" onClick={() => void load("medium")}>Load in 200 ms</button>
        <button type="button" onClick={() => void load("slow")}>Load in 400 ms</button>
        <button type="button" onClick={() => void load("refresh")}>Quiet refresh</button>
      </div>
      <ShimmerRegion
        loading={loading}
        quietRefresh={quietRefresh}
        skeleton={<SkeletonCard />}
        minHeight={386}
        loadingLabel="Loading team updates"
      >
        {rows && <DataCard rows={rows} />}
      </ShimmerRegion>
      <div className="footer" data-footer="">Six team updates</div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><Fixture /></StrictMode>,
);

