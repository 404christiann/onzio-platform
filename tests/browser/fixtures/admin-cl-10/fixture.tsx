import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { EditableRegion } from "@/components/admin/ui/EditableRegion";
import { PreviewToggle, type PreviewSize } from "@/components/admin/ui/PreviewToggle";
import "@/styles/globals.css";
import "./fixture.css";

const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";

function Fixture() {
  const [opens, setOpens] = useState(0);
  const [size, setSize] = useState<PreviewSize>("desktop");
  const [headline, setHeadline] = useState("A page to preview");

  return (
    <main className="admin-theme admin-portal fixture" data-admin-theme={theme}>
      <AdminPage>
        <AdminPageHeader
          breadcrumb="Public website"
          title="About"
          description="Choose a section to edit. Changes appear in the preview."
          actions={<><div data-admin-page-action-group="" className="fixture-actions"><label>View season<select defaultValue="2026"><option value="2026">2026 season</option></select></label><button type="button">Add match</button></div><div className="fixture-dirty-status"><span aria-hidden="true" /><span>Unsaved changes</span></div></>}
        />
        <AdminPanel>
          <div className="fixture-toolbar">
            <h2>What visitors see</h2>
            <PreviewToggle value={size} onChange={setSize} />
          </div>
          <div className="fixture-preview" data-preview-size={size}>
            <EditableRegion ariaLabel="Edit page heading" editLabel="page heading" onEdit={() => setOpens((value) => value + 1)}>
              <div className="fixture-region">
                <p>Public page heading</p>
                <h3>{headline}</h3>
                <a href="/unexpected-navigation">Read the story</a>
              </div>
            </EditableRegion>
            <EditableRegion ariaLabel="Edit missing story" editLabel="story" invalid onEdit={() => setOpens((value) => value + 1)}>
              <p className="fixture-region">Add your story here.</p>
            </EditableRegion>
          </div>
          <label className="fixture-input">Headline <input value={headline} onChange={(event) => setHeadline(event.target.value)} /></label>
          <output data-edit-opens="">Editor openings: {opens}</output>
        </AdminPanel>
      </AdminPage>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
