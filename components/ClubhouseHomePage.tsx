"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "@/components/ResilientImage";
import Hero from "@/components/Hero";
import PhotoSlideshow from "@/components/PhotoSlideshow";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import type {
  DBAboutPageContent,
  DBSiteSponsorLogo,
  ShopKitVariant,
} from "@/lib/db-types";
import type { Fixture } from "@/lib/data";
import {
  fetchAboutClubContent,
  fetchSchedule,
  fetchShopKitVariants,
  fetchSiteSponsorLogos,
  type ShopKitContent,
} from "@/lib/queries";
import { imageDeliveryProps } from "@/lib/image-delivery";

const matchDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const matchTimeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function initials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function fixtureToDate(fixture: Fixture) {
  const [year, month, day] = fixture.date.split("-").map(Number);
  const [hours, minutes] = (fixture.time || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0);
}

function kitLabel(variant: ShopKitVariant) {
  if (variant === "home") return "Blue Jersey";
  if (variant === "third") return "Red Jersey";
  return "White Jersey";
}

function kitTitle(content: ShopKitContent, variant: ShopKitVariant) {
  return content.section?.title?.trim() || kitLabel(variant);
}

function ClubhouseNextMatch() {
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);

  useEffect(() => {
    fetchSchedule(undefined, club.id)
      .then(setFixtures)
      .catch((error) => {
        console.error("ClubhouseHomePage schedule:", error);
        setFixtures([]);
      });
  }, [club.id]);

  const { latest, next } = useMemo(() => {
    const now = Date.now();
    const dated = fixtures
      .map((fixture) => ({ fixture, kickoff: fixtureToDate(fixture) }))
      .filter((entry) => !Number.isNaN(entry.kickoff.getTime()));
    return {
      latest:
        dated
          .filter(
            ({ fixture, kickoff }) =>
              kickoff.getTime() < now &&
              fixture.roseCityScore !== null &&
              fixture.opponentScore !== null,
          )
          .sort((left, right) => right.kickoff.getTime() - left.kickoff.getTime())[0]
          ?.fixture ?? null,
      next:
        dated
          .filter(({ kickoff }) => kickoff.getTime() > now)
          .sort((left, right) => left.kickoff.getTime() - right.kickoff.getTime())[0]
          ?.fixture ?? null,
    };
  }, [fixtures]);

  if (!next) return null;

  const kickoff = fixtureToDate(next);
  const latestOpponent = latest ? initials(latest.opponent) : null;

  return (
    <section className="clubhouse-match-feature">
      <header className="clubhouse-match-feature-head">
        <span className="clubhouse-eyebrow">Next match</span>
        <p>{next.competition || "Midwest Premier League"}</p>
      </header>
      <div className="clubhouse-match-stage">
        <div className="clubhouse-match-side">
          {clubLogoUrl && (
            <Image
              src={clubLogoUrl}
              alt={`${club.name} crest`}
              width={220}
              height={218}
              {...imageDeliveryProps("club-logo")}
            />
          )}
          <strong>Lions FC</strong>
        </div>
        <div className="clubhouse-match-center">
          <span>VS</span>
          <p>{next.home ? "Home" : "Away"}</p>
        </div>
        <div className="clubhouse-match-side clubhouse-match-opponent">
          <span aria-hidden>{initials(next.opponent)}</span>
          <strong>{next.opponent}</strong>
        </div>
      </div>
      <div className="clubhouse-match-meta">
        <p>
          <small>Date</small>
          <strong>{matchDateFormat.format(kickoff)}</strong>
        </p>
        <p>
          <small>Kickoff</small>
          <strong>{matchTimeFormat.format(kickoff)}</strong>
        </p>
        <p>
          <small>Venue</small>
          <strong>{next.venue}</strong>
        </p>
      </div>
      <footer className="clubhouse-match-feature-foot">
        {latest && latestOpponent && (
          <p>
            <small>Latest result</small>
            <strong>
              LFC {latest.roseCityScore}-{latest.opponentScore} {latestOpponent}
            </strong>
            <span>{latest.opponent}</span>
          </p>
        )}
        <Link href="/schedule">Full schedule</Link>
      </footer>
    </section>
  );
}

function ClubhouseKitHome() {
  const club = useClubContext();
  const [contentByVariant, setContentByVariant] =
    useState<Record<ShopKitVariant, ShopKitContent> | null>(null);

  useEffect(() => {
    fetchShopKitVariants("shop", club.id)
      .then(setContentByVariant)
      .catch((error) => {
        console.error("ClubhouseHomePage kits:", error);
        setContentByVariant(null);
      });
  }, [club.id]);

  const kits = (["home", "third", "away"] as ShopKitVariant[])
    .map((variant) => {
      const content = contentByVariant?.[variant];
      const photo = content?.photos[0];
      if (!content?.section || !photo) return null;
      return { variant, content, photo };
    })
    .filter(Boolean) as Array<{
    variant: ShopKitVariant;
    content: ShopKitContent;
    photo: { url: string };
  }>;

  if (kits.length === 0) return null;

  return (
    <section className="clubhouse-kit-home">
      <header className="clubhouse-kit-home-head">
        <div>
          <span className="clubhouse-eyebrow">Official collection · 2026</span>
          <h2>
            Three colors.
            <br />
            <em>One badge.</em>
          </h2>
        </div>
        <div className="clubhouse-kit-home-intro">
          <p>
            Built in navy, red, and white for every side of matchday. The
            Capital City collection carries the Lions crest wherever the club
            goes.
          </p>
          <Link href="/shop">Shop the collection</Link>
        </div>
      </header>
      <div className="clubhouse-kit-collection" role="list" aria-label="2026 Lions Football Club jerseys">
        {kits.map(({ variant, content, photo }, index) => (
          <Link
            href="/shop"
            className="clubhouse-kit-product"
            data-kit={index + 1}
            role="listitem"
            key={variant}
          >
            <div className="clubhouse-kit-product-media">
              <Image
                src={photo.url}
                alt={kitTitle(content, variant)}
                fill
                sizes="(max-width: 800px) 82vw, 34vw"
                {...imageDeliveryProps("shop-photo")}
              />
            </div>
            <div className="clubhouse-kit-product-meta">
              <span>
                <small>Official 2026 jersey</small>
                <strong>{kitTitle(content, variant)}</strong>
              </span>
              <span className="clubhouse-kit-product-price">$75</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ClubhouseClubStory() {
  const club = useClubContext();
  const [about, setAbout] = useState<DBAboutPageContent | null>(null);

  useEffect(() => {
    fetchAboutClubContent(club.id)
      .then((content) => setAbout(content.about))
      .catch((error) => {
        console.error("ClubhouseHomePage about:", error);
        setAbout(null);
      });
  }, [club.id]);

  const values = about?.values?.map((value) => value.title).filter(Boolean) ?? [];
  const story = about?.story_paragraphs?.[0] ??
    "Lions Football Club was founded to give Columbus a club that competes with ambition and belongs to its community.";

  return (
    <section className="clubhouse-club-story">
      <header className="clubhouse-story-heading">
        <span className="clubhouse-eyebrow">Our identity</span>
        <h2>
          A club shaped by
          <br />
          <em>Columbus.</em>
        </h2>
      </header>
      <div className="clubhouse-story-copy">
        <p>{story}</p>
        <div className="clubhouse-story-meta">
          <span>
            Founded <strong>2014</strong>
          </span>
          <span>
            Home <strong>Scioto Field</strong>
          </span>
        </div>
        <Link href="/club/about">Our story</Link>
      </div>
      {values.length > 0 && (
        <aside className="clubhouse-story-pillars" aria-label={`What defines ${club.name}`}>
          <span className="clubhouse-story-pillars-label">What defines us</span>
          {values.slice(0, 3).map((value) => (
            <p key={value}>{value}</p>
          ))}
        </aside>
      )}
    </section>
  );
}

function ClubhousePartners() {
  const club = useClubContext();
  const [partners, setPartners] = useState<DBSiteSponsorLogo[]>([]);

  useEffect(() => {
    Promise.all([
      fetchSiteSponsorLogos("carousel", club.id),
      fetchSiteSponsorLogos("footer", club.id),
    ])
      .then(([carousel, footer]) => setPartners([...carousel, ...footer]))
      .catch((error) => {
        console.error("ClubhouseHomePage partners:", error);
        setPartners([]);
      });
  }, [club.id]);

  if (partners.length === 0) return null;

  return (
    <section className="clubhouse-partner-home">
      <span className="clubhouse-eyebrow">Proudly supported by</span>
      <div>
        {partners.map((partner, index) => (
          <span
            key={partner.id}
            data-level={index < 3 ? "gold" : "partner"}
          >
            {partner.name}
          </span>
        ))}
      </div>
      <Link href="/sponsors">Meet our partners</Link>
    </section>
  );
}

export default function ClubhouseHomePage() {
  return (
    <div className="clubhouse-prospect-home" data-presentation-template="clubhouse@1">
      <Hero />
      <ClubhouseNextMatch />
      <PhotoSlideshow />
      <ClubhouseKitHome />
      <ClubhouseClubStory />
      <ClubhousePartners />
    </div>
  );
}
