import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { adminClassicEdgeCases, type AdminClassicEdgeItem } from "../admin-classic-edge-cases";
import "@/styles/globals.css";
import "./fixture.css";

const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";

function Fixture() {
  const [items, setItems] = useState<AdminClassicEdgeItem[]>(adminClassicEdgeCases.zeroItems);

  return (
    <main className="admin-theme admin-portal fixture" data-admin-theme={theme}>
      <AdminPage>
        <AdminPageHeader
          breadcrumb="Players"
          title={adminClassicEdgeCases.longClubName}
          description="Review roster contact details"
          actions={<button type="button" onClick={() => setItems(adminClassicEdgeCases.manyItems)}>Show 51 players</button>}
        />
        <AdminPanel>
          <div className="edge-toolbar">
            <h2>Players</h2>
            <button type="button" onClick={() => setItems(adminClassicEdgeCases.zeroItems)}>Clear players</button>
          </div>
          {items.length === 0 ? (
            <p role="status" data-empty-state="">No players yet</p>
          ) : (
            <ul className="edge-list" aria-label="Players">
              {items.map((item) => (
                <li className="edge-row" key={item.id} data-edge-row="">
                  <strong>{item.name}</strong>
                  <span>{item.email}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      </AdminPage>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
