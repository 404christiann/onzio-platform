"use client";

import { createContext, type Dispatch, type SetStateAction } from "react";

export type RosterStatsChanges = { dirty: boolean; save: () => Promise<boolean> };
export const RosterEditorStatsContext = createContext<Dispatch<SetStateAction<RosterStatsChanges | null>> | null>(null);
