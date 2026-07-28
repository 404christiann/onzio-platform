"use client";

import { useEffect, useRef } from "react";
import Image from "@/components/ResilientImage";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { DBClubLogoPageContent } from "@/lib/db-types";
import { useClubContext } from "@/components/ClubContextProvider";
import { imageDeliveryProps } from "@/lib/image-delivery";

gsap.registerPlugin(ScrollTrigger);

const PATCH_SCALE = 1.1;

export default function ClubLogoPageClient({
  content,
  animate = true,
}: {
  content: DBClubLogoPageContent;
  animate?: boolean;
}) {
  const club = useClubContext();
  const diagramRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const colorCardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        diagramRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.9, ease: "power3.out" },
      );
      gsap.fromTo(
        rowsRef.current?.children ?? [],
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.15,
          scrollTrigger: { trigger: rowsRef.current, start: "top 85%" },
        },
      );
      gsap.fromTo(
        mapRef.current,
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: mapRef.current, start: "top 85%" },
        },
      );
      gsap.fromTo(
        colorCardsRef.current,
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: colorCardsRef.current, start: "top 85%" },
        },
      );
    });
    return () => ctx.revert();
  }, [animate]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#18181A" }}>
      <div
        ref={diagramRef}
        className="pt-40 pb-6 px-6"
        style={{ opacity: animate ? 0 : 1 }}
      >
        {content.annotated_image_url && <div className="relative w-full max-w-xl mx-auto" style={{ aspectRatio: "2436 / 1493" }}>
          <Image
            src={content.annotated_image_url}
            alt={`${club.name} crest annotation`}
            fallbackVariant="logo"
            fill
            className="object-contain"
            sizes="(max-width: 640px) 100vw, 576px"
            priority
            {...imageDeliveryProps("small-graphic")}
          />
        </div>}
      </div>

      <div ref={rowsRef} className="max-w-2xl mx-auto px-6 pb-10 flex flex-col gap-10">
        {content.features.map((feature) => (
          <div
            key={feature.title}
            className="flex items-center gap-5 sm:gap-6"
            style={{ opacity: animate ? 0 : 1 }}
          >
            <div className="relative flex-shrink-0 overflow-hidden" style={{ width: 150, height: 150 }}>
              <Image
                src={feature.patch_url}
                alt={`${feature.title} patch`}
                fallbackVariant="logo"
                fill
                className="object-contain"
                style={{ transform: `scale(${PATCH_SCALE})` }}
                sizes="150px"
                {...imageDeliveryProps("small-graphic")}
              />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2
                  className="font-display font-black uppercase text-white leading-none"
                  style={{ fontSize: "1.4rem" }}
                >
                  {feature.title}
                </h2>
                <div
                  className="relative flex-shrink-0 overflow-hidden"
                  style={{ width: feature.icon_size, height: feature.icon_size }}
                >
                  <Image
                    src={feature.icon_url}
                    alt=""
                    fallbackVariant="logo"
                    fill
                    className="object-contain"
                    style={{ transform: `scale(${feature.icon_scale})` }}
                    sizes={`${feature.icon_size}px`}
                    {...imageDeliveryProps("small-graphic")}
                  />
                </div>
              </div>
              <p
                className="font-body leading-normal"
                style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.95rem" }}
              >
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        ref={mapRef}
        className="max-w-sm mx-auto px-6 pb-10"
        style={{ opacity: animate ? 0 : 1 }}
      >
        {content.map_image_url && <div className="relative w-full" style={{ aspectRatio: "991 / 1281" }}>
          <Image
            src={content.map_image_url}
            alt={`${club.name} home map`}
            fallbackVariant="logo"
            fill
            className="object-contain"
            sizes="384px"
            {...imageDeliveryProps("small-graphic")}
          />
        </div>}
      </div>

      <div
        ref={colorCardsRef}
        className="mx-auto grid max-w-3xl grid-cols-3 gap-x-5 gap-y-4 px-3 pb-32 sm:px-6 md:gap-x-8"
        style={{ opacity: animate ? 0 : 1 }}
      >
        {content.color_cards.map((card) => (
          <div key={card.label} className="relative w-full" style={{ aspectRatio: "334 / 214" }}>
            <Image
              src={card.image_url}
              alt={`${card.label} brand color`}
              fallbackVariant="logo"
              fill
              className="object-contain"
              sizes="(max-width: 640px) 31vw, 220px"
              {...imageDeliveryProps("small-graphic")}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
