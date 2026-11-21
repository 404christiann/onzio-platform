import { useState } from "react";
import { createRoot } from "react-dom/client";
import HeroVideoControl from "@/components/admin/homepage/HeroVideoControl";
import { useHeroVideoController } from "@/components/admin/homepage/useHeroVideoController";
import "@/styles/globals.css";

function Page() {
  const [refreshed, setRefreshed] = useState("");
  const controller = useHeroVideoController(true, async (range) => {
    setRefreshed(`${range.before}:${range.after}`);
    return "applied";
  });
  return (
    <div className="admin-theme" data-admin-theme="light">
      <div className="admin-portal" style={{ maxWidth: 720, padding: 24 }}>
        <h1>Homepage</h1>
        <nav aria-label="Primary admin navigation">
          <a href="/admin/roster">Roster</a>
        </nav>
        <p data-refreshed={refreshed} hidden>{refreshed}</p>
        {controller ? <HeroVideoControl controller={controller} disabled={new URLSearchParams(window.location.search).has("disabled")} /> : <p>Loading the editor…</p>}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
