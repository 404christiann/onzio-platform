import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminAccordion } from "@/components/admin/ui/AdminAccordion";
import { AdminBar } from "@/components/admin/ui/AdminBar";
import "@/styles/globals.css";
import "./fixture.css";

const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
const labels = ["Goals", "Assists", "Starts", "Minutes", "Saves", "Clean sheets", "Discipline", "Form"];
const longTabs = new URLSearchParams(location.search).has("longTabs");
const longLabel = "PlayersWithAnExtremelyLongUnbreakableLabelThatMustRemainAccessible";
const longBadge = "12345678901234567890";

function Fixture() {
  const [fraction, setFraction] = useState(.35);
  const [barRevision, setBarRevision] = useState(0);
  const [tab, setTab] = useState("players");
  const [open, setOpen] = useState(true);

  return (
    <main className="admin-theme admin-portal fixture" data-admin-theme={theme}>
      <h1>Classic admin motion primitives</h1>
      <div className="toolbar">
        <button type="button" onClick={() => setFraction((value) => value === .35 ? .72 : .35)}>Update values</button>
        <button type="button" onClick={() => setBarRevision((value) => value + 1)}>Replay bars</button>
      </div>
      <section className="panel">
        <h2>Season output</h2>
        <div className="bars" key={barRevision}>
          {labels.map((label, index) => (
            <div className="bar-row" key={label}>
              <span>{label}</span>
              <AdminBar label={label} fraction={fraction * (index + 1) / labels.length} staggerIndex={index} />
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Roster views</h2>
        <AdminTabs
          items={[
            { id: "players", label: longTabs ? longLabel : "Players", badge: longTabs ? longBadge : 12 },
            { id: "unavailable", label: "Unavailable", disabled: true },
            { id: "staff", label: "Staff", badge: 3 },
          ]}
          value={tab}
          onChange={setTab}
          tabsId="fixture-roster"
          label="Roster views"
        />
        <div id="fixture-roster-panel-players" role="tabpanel" aria-labelledby="fixture-roster-tab-players" hidden={tab !== "players"}>Player panel</div>
        <div id="fixture-roster-panel-staff" role="tabpanel" aria-labelledby="fixture-roster-tab-staff" hidden={tab !== "staff"}>Staff panel</div>
      </section>
      <AdminAccordion title="Forwards" open={open} onOpenChange={setOpen}>
        <div className="accordion-content"><button type="button">Edit a forward</button></div>
      </AdminAccordion>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
