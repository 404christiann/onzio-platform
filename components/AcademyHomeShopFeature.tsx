"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import ResilientImage from "@/components/ResilientImage";
import { fetchShopKitVariants, type ShopKitContent } from "@/lib/queries";
import {
  kitPhotoAlt,
  normalizeKitBulletPoints,
  normalizeKitStoreNote,
  titleLines,
} from "@/lib/shop-kit";
import { useClubId } from "@/components/ClubContextProvider";

// Mockup-parity homepage store feature for academy@1 (DCFC-D132 pass),
// modeled on the sales mockup's HomeShopFeature: front/back jersey renders
// side by side on the sky #B9E3F6 panel with the fade into the page
// ground, and the red "Buy Now"-style CTA into /shop. Copy stays
// admin-editable through the existing home-surface shop kit section.
export default function AcademyHomeShopFeature() {
  const clubId = useClubId();
  const [content, setContent] = useState<ShopKitContent | null>(null);

  useEffect(() => {
    fetchShopKitVariants("home", clubId)
      .then((variants) => setContent(variants.home))
      .catch((error) => {
        console.error("AcademyHomeShopFeature:", error);
      });
  }, [clubId]);

  const section = content?.section;
  const photos = (content?.photos ?? []).filter(
    (photo) => photo.url.trim().length > 0,
  );
  if (!section || photos.length === 0) return null;

  const [front, back] = photos;
  const bulletPoints = normalizeKitBulletPoints(section.bullet_points);
  const storeNote = normalizeKitStoreNote(section.store_note).trim();

  return (
    <section className="relative w-full overflow-hidden bg-[#F9FAFD]">
      <div className="flex flex-col md:min-h-[680px] md:flex-row">
        <div className="relative min-h-[520px] w-full overflow-hidden bg-[#B9E3F6] md:min-h-full md:w-1/2">
          {back ? (
            <>
              <div className="absolute inset-y-0 -left-[3%] w-[64%]">
                <ResilientImage
                  src={front.url}
                  alt={kitPhotoAlt(section.title, 0, photos.length)}
                  fill
                  priority
                  sizes="(max-width: 767px) 58vw, 29vw"
                  className="object-contain object-center p-2 sm:p-4"
                />
              </div>
              <div className="absolute inset-y-0 -right-[3%] w-[60%]">
                <ResilientImage
                  src={back.url}
                  alt={kitPhotoAlt(section.title, 1, photos.length)}
                  fill
                  priority
                  sizes="(max-width: 767px) 52vw, 26vw"
                  className="object-contain object-center"
                />
              </div>
            </>
          ) : (
            <div className="absolute inset-6">
              <ResilientImage
                src={front.url}
                alt={kitPhotoAlt(section.title, 0, photos.length)}
                fill
                priority
                sizes="(max-width: 767px) 100vw, 50vw"
                className="object-contain object-center"
              />
            </div>
          )}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[48%]"
            style={{
              background:
                "linear-gradient(to bottom, rgba(249,250,253,0) 0%, rgba(249,250,253,.42) 36%, rgba(249,250,253,.88) 72%, #F9FAFD 96%)",
            }}
          />
        </div>

        <div className="flex w-full flex-col justify-center px-6 py-14 sm:px-10 md:w-1/2 md:px-14 md:py-20 lg:px-20">
          {section.eyebrow ? (
            <p className="mb-4 font-nav text-[clamp(1rem,2vw,1.3rem)] font-bold uppercase text-[#FF1616]">
              {section.eyebrow}
            </p>
          ) : null}
          <h2 className="mb-6 font-display text-[clamp(2.8rem,6vw,5rem)] font-black uppercase italic leading-none text-[#1E3653]">
            {titleLines(section.title).map((line, index, lines) => (
              <Fragment key={index}>
                {line}
                {index < lines.length - 1 && <br />}
              </Fragment>
            ))}
          </h2>
          <div className="mb-8 h-0.5 w-12 bg-[#FF1616]" />

          {section.description ? (
            <p className="mb-8 max-w-xl font-body text-[clamp(.9rem,1.4vw,1rem)] leading-relaxed text-[#51667E]">
              {section.description}
            </p>
          ) : null}

          <ul className="mb-8 flex flex-col gap-3">
            {bulletPoints.map((detail, index) => (
              <li key={`${detail}-${index}`} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#FF1616]" />
                <span className="font-body text-sm text-[#51667E]">{detail}</span>
              </li>
            ))}
          </ul>

          {storeNote ? (
            <p className="mb-8 whitespace-pre-line font-body text-xs text-[#51667E]/75">
              {storeNote}
            </p>
          ) : null}

          <Link
            href="/shop"
            className="inline-flex w-full items-center justify-center bg-[#FF1616] px-10 py-4 font-nav text-sm font-bold uppercase text-white transition-colors hover:bg-[#D70000] md:w-fit"
          >
            {section.cta_label}
          </Link>
        </div>
      </div>
    </section>
  );
}
