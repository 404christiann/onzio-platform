"use client";

import type { ReactNode } from "react";
import type { CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import CinematicNav from "./CinematicNav";
import CinematicFooter from "./CinematicFooter";
import { CinematicContentProvider } from "./CinematicContent";
import "./cinematic.css";

export default function CinematicShell({ children, editing = false, initialContent = null, contentOnly = false }: { children: ReactNode; editing?: boolean; initialContent?: CinematicHomepageContent | null; contentOnly?: boolean }) {
  return <CinematicContentProvider initialContent={initialContent}><div className="cinematic-site" data-site-template="cinematic" data-template-version="2">
    {!editing && !contentOnly && <a className="skip" href="#cinematic-main">Skip to content</a>}
    {!contentOnly && <CinematicNav editing={editing} />}
    {contentOnly ? children : <main id="cinematic-main" className="cinematic-main">{children}</main>}
    {!contentOnly && <CinematicFooter />}
  </div></CinematicContentProvider>;
}
