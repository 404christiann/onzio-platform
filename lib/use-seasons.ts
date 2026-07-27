"use client";

import { useEffect, useState } from "react";
import type { DBSeason } from "@/lib/db-types";
import { useClubId } from "@/components/ClubContextProvider";
import { fetchSeasons } from "@/lib/queries";

export function useSeasons() {
  const clubId = useClubId();
  const [seasons, setSeasons] = useState<DBSeason[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSeasons() {
      let rows: DBSeason[];
      try {
        rows = await fetchSeasons(clubId);
      } catch (error) {
        if (cancelled) return;
        console.error(
          "Failed to load seasons:",
          error instanceof Error ? error.message : error,
        );
        setLoading(false);
        return;
      }

      if (cancelled) return;
      const active = rows.find((season) => season.active) ?? null;
      const defaultSeasonId = active?.id ?? rows[0]?.id ?? "";

      setSeasons(rows);
      setActiveSeasonId(active?.id ?? null);
      setSelectedSeasonId((current) => current || defaultSeasonId);
      setLoading(false);
    }

    loadSeasons();
    return () => { cancelled = true; };
  }, [clubId]);

  return {
    seasons,
    activeSeasonId,
    selectedSeasonId,
    setSelectedSeasonId,
    loading,
  };
}
