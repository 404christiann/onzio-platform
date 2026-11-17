import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import guided from "@/components/admin/AdminGuided.module.css";
import { ClassicAboutToastBoundary, ClassicAboutTools, ClassicAboutValues } from "@/components/admin/about/ClassicAboutTools";
import { EMPTY_ABOUT_PAGE_CONTENT } from "@/lib/about-content";
import type { DBAboutPageContent } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import "@/styles/globals.css";
import "@/components/admin/about/about-editor.css";

function Fixture() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const ids = useRef(["progress-id", "together-id"]);
  const generation = useRef(0);
  const [content, setContent] = useState<DBAboutPageContent>({
    ...EMPTY_ABOUT_PAGE_CONTENT,
    values_heading: "Our values",
    values: [
      { title: "Progress", description: "Keep learning." },
      { title: "Together", description: "Everyone belongs." },
    ],
  });
  const theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
  return <main className="admin-theme" data-admin-theme={theme}>
    <div className={`admin-portal min-h-screen bg-background p-4 text-foreground ${guided.portal}`}>
      <h1>About footer toast</h1>
      <ClassicAboutToastBoundary>
        <Button ref={opener} onClick={() => setOpen(true)}>Edit Values</Button>
        <ClassicAboutTools open={open} onClose={() => setOpen(false)} opener={opener} title="Values">
          <ClassicAboutValues content={content} invalid={false} onChange={setContent} ids={ids} generation={generation} />
        </ClassicAboutTools>
      </ClassicAboutToastBoundary>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
