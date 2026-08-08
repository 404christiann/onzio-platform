"use client";

import { useEffect, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import { fetchShopKitVariants, type ShopKitContent } from "@/lib/queries";
import {
  normalizeKitBulletPoints,
  normalizeKitStoreNote,
} from "@/lib/shop-kit";
import { useClubId } from "@/components/ClubContextProvider";

const VIEW_LABELS = ["Front", "Back"] as const;

// Splits an admin bullet like "Available item: Match Jersey" into the
// mockup's dt/dd column pair; bullets without a colon render label-only.
function splitBullet(bullet: string): { label: string; value: string } {
  const index = bullet.indexOf(":");
  if (index === -1) return { label: bullet, value: "" };
  return {
    label: bullet.slice(0, index).trim(),
    value: bullet.slice(index + 1).trim(),
  };
}

// Mockup-parity shop page for academy@1 (DCFC-D132 pass): the compact
// split layout from the sales mockup's shop page — sky jersey panel with
// the Front/Back pill toggle, and the detail column with the hairline
// dl grid and red order CTA. Deliberately no photo strip, no dark
// purchase-details cards, and no closing band: the mockup's page ends at
// this section.
export default function AcademyShopPage() {
  const clubId = useClubId();
  const [content, setContent] = useState<ShopKitContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState(0);

  useEffect(() => {
    fetchShopKitVariants("shop", clubId)
      .then((variants) => setContent(variants.home))
      .catch((error) => {
        console.error("AcademyShopPage:", error);
      })
      .finally(() => setLoading(false));
  }, [clubId]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] w-full items-center justify-center bg-[#F9FAFD]">
        <p className="font-display text-base font-black uppercase tracking-widest text-[#6B7E94]">
          Loading collection…
        </p>
      </div>
    );
  }

  const section = content?.section;
  const photos = (content?.photos ?? [])
    .filter((photo) => photo.url.trim().length > 0)
    .slice(0, VIEW_LABELS.length);
  if (!section || photos.length === 0) return null;

  const bulletPoints = normalizeKitBulletPoints(section.bullet_points);
  const storeNote = normalizeKitStoreNote(section.store_note).trim();
  const detailPairs = bulletPoints.slice(0, 2).map(splitBullet);

  return (
    <main className="bg-[#F9FAFD] pt-24 text-[#1E3653] sm:pt-28">
      <section className="mx-auto grid max-w-[1440px] lg:h-[calc(100svh-7rem)] lg:grid-cols-[1.05fr_.95fr]">
        <div className="relative min-h-[420px] overflow-hidden bg-[#B9E3F6] sm:min-h-[520px] lg:min-h-0">
          {photos.map((photo, index) => (
            <ResilientImage
              key={photo.id}
              src={photo.url}
              alt={
                activeView === index
                  ? `${VIEW_LABELS[index]} of the ${section.title}`
                  : ""
              }
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 54vw"
              className={`object-contain p-5 transition-opacity duration-500 sm:p-10 ${
                activeView === index ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}

          {photos.length > 1 ? (
            <div
              className="absolute bottom-5 left-1/2 grid w-60 -translate-x-1/2 grid-cols-2 rounded-full border border-[#1E3653]/15 bg-[#F9FAFD]/95 p-1.5 shadow-[0_12px_30px_rgba(30,54,83,0.18)] backdrop-blur-sm sm:w-64"
              aria-label="Choose jersey view"
              role="group"
            >
              {photos.map((photo, index) => {
                const selected = activeView === index;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActiveView(index)}
                    className={`w-full min-w-0 rounded-full px-4 py-3 font-nav text-sm font-bold uppercase tracking-[.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF1616] focus-visible:ring-offset-2 ${
                      selected
                        ? "bg-[#1E3653] text-[#F9FAFD]"
                        : "bg-transparent text-[#51667E] hover:bg-[#B9E3F6]/65 hover:text-[#1E3653]"
                    }`}
                  >
                    {VIEW_LABELS[index]}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 lg:py-8 xl:px-20">
          {section.eyebrow ? (
            <p className="font-nav text-sm font-bold uppercase text-[#FF1616]">
              {section.eyebrow}
            </p>
          ) : null}
          <h1 className="mt-3 max-w-2xl font-display text-[clamp(2.75rem,4.7vw,4.75rem)] font-black uppercase italic leading-[.9]">
            {section.title}
          </h1>
          {section.description ? (
            <p className="mt-5 max-w-xl font-body text-base leading-7 text-[#51667E] md:text-lg">
              {section.description}
            </p>
          ) : null}

          {detailPairs.length > 0 ? (
            <dl className="mt-6 grid grid-cols-2 border-y border-[#1E3653]/15 py-4">
              {detailPairs.map((pair, index) => (
                <div
                  key={pair.label}
                  className={
                    index === 0
                      ? "border-r border-[#1E3653]/15 pr-5"
                      : "pl-5"
                  }
                >
                  <dt className="font-nav text-xs font-bold uppercase text-[#51667E]">
                    {pair.label}
                  </dt>
                  <dd className="mt-2 font-body font-semibold">
                    {pair.value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {storeNote ? (
            <p className="mt-4 max-w-xl whitespace-pre-line font-body text-sm leading-6 text-[#51667E]">
              {storeNote}
            </p>
          ) : null}

          <a
            href={section.cta_link}
            className="mt-6 inline-flex w-fit bg-[#FF1616] px-8 py-4 font-nav text-sm font-bold uppercase text-white transition-colors hover:bg-[#1E3653]"
          >
            {section.cta_label}
          </a>
        </div>
      </section>
    </main>
  );
}
