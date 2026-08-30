"use client";

import { useEffect, useMemo, useState } from "react";
import { useClubId } from "@/components/ClubContextProvider";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import type { DBSiteSponsorLogo } from "@/lib/db-types";

type SponsorTier = {
  id: "title" | "gold" | "partner";
  marker: string;
  label: string;
  sponsors: DBSiteSponsorLogo[];
};

function buildTiers(
  carouselSponsors: DBSiteSponsorLogo[],
  footerSponsors: DBSiteSponsorLogo[],
): SponsorTier[] {
  return [
    {
      id: "title",
      marker: "01",
      label: "Title partner",
      sponsors: carouselSponsors.slice(0, 1),
    },
    {
      id: "gold",
      marker: "02",
      label: "Premier partners",
      sponsors: carouselSponsors.slice(1),
    },
    {
      id: "partner",
      marker: "03",
      label: "Club partners",
      sponsors: footerSponsors,
    },
  ];
}

export default function ClubhouseSponsorsPage() {
  const clubId = useClubId();
  const [carouselSponsors, setCarouselSponsors] = useState<DBSiteSponsorLogo[]>([]);
  const [footerSponsors, setFooterSponsors] = useState<DBSiteSponsorLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchSiteSponsorLogos("carousel", clubId),
      fetchSiteSponsorLogos("footer", clubId),
    ])
      .then(([nextCarousel, nextFooter]) => {
        if (cancelled) return;
        setCarouselSponsors(nextCarousel);
        setFooterSponsors(nextFooter);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load partners.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const tiers = useMemo(
    () => buildTiers(carouselSponsors, footerSponsors),
    [carouselSponsors, footerSponsors],
  );

  return (
    <div className="clubhouse-route-page clubhouse-sponsors-page">
      <header className="clubhouse-route-hero clubhouse-sponsors-hero">
        <div>
          <p className="clubhouse-eyebrow">Club partners</p>
          <h1>
            Backing the badge.
            <br />
            <em>Building the city.</em>
          </h1>
        </div>
      </header>

      <section className="clubhouse-sponsor-tiers">
        {loading && <div className="clubhouse-route-state">Loading partners</div>}
        {error && !loading && <div className="clubhouse-route-state">{error}</div>}
        {!loading &&
          !error &&
          tiers.map((tier) => (
            <section key={tier.id} className="clubhouse-sponsor-tier">
              <div className="clubhouse-sponsor-tier-heading">
                <span>{tier.marker}</span>
                <h2>{tier.label}</h2>
                <small>
                  {tier.sponsors.length}{" "}
                  {tier.sponsors.length === 1 ? "partner" : "partners"}
                </small>
              </div>
              <div className={`clubhouse-sponsor-grid ${tier.id}`}>
                {tier.sponsors.map((sponsor) => (
                  <article key={sponsor.id}>
                    <strong>{sponsor.name}</strong>
                    {tier.id === "title" && <p>Backing Columbus ambition.</p>}
                  </article>
                ))}
              </div>
            </section>
          ))}
      </section>
    </div>
  );
}
