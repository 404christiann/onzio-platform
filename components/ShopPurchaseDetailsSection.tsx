"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { DBShopPurchaseDetails } from "@/lib/db-types";
import { normalizeShopPurchaseDetails } from "@/lib/shop-purchase-details";

gsap.registerPlugin(ScrollTrigger);

interface ShopPurchaseDetailsSectionProps {
  details: DBShopPurchaseDetails;
  animate?: boolean;
}

export default function ShopPurchaseDetailsSection({
  details,
  animate = true,
}: ShopPurchaseDetailsSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const content = normalizeShopPurchaseDetails(details);

  useEffect(() => {
    if (!animate) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        sectionRef.current,
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 85%" },
        },
      );
    });
    return () => ctx.revert();
  }, [animate]);

  return (
    <div style={{ backgroundColor: "var(--color-black)" }}>
      <div
        ref={sectionRef}
        className="mx-auto max-w-7xl px-6 py-20 md:py-28 lg:px-10"
        style={{ opacity: animate ? 0 : 1 }}
      >
        <div className="mb-10 flex items-center gap-4 md:mb-14">
          <h2
            className="font-display font-black italic uppercase leading-none text-white"
            style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}
          >
            {content.heading}
          </h2>
          <div
            className="h-px flex-1"
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {content.cards.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className="border px-5 py-6 md:px-7 md:py-8"
              style={{
                borderColor: "rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              <p
                className="font-display mb-3 font-normal uppercase tracking-widest"
                style={{ color: "var(--color-red)", fontSize: "0.72rem" }}
              >
                {item.label}
              </p>
              <h3
                className="font-display mb-4 font-black uppercase leading-none text-white"
                style={{ fontSize: "clamp(1.4rem, 3vw, 2rem)" }}
              >
                {item.title}
              </h3>
              <p
                className="font-body whitespace-pre-line leading-relaxed"
                style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.95rem" }}
              >
                {item.body}
              </p>
            </div>
          ))}
        </div>

        <div
          className="mt-10 flex flex-col justify-between gap-4 pt-8 sm:flex-row sm:items-center"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <p
              className="font-display mb-1 font-bold uppercase tracking-widest"
              style={{ color: "var(--color-gray-mid)", fontSize: "0.75rem" }}
            >
              {content.cta_eyebrow}
            </p>
            <p className="font-body text-sm text-white">{content.cta_text}</p>
          </div>
          <a
            href={content.cta_link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display flex items-center justify-center px-8 py-3.5 font-bold uppercase tracking-widest transition-all duration-200 sm:inline-flex"
            style={{
              backgroundColor: "var(--color-red)",
              color: "#fff",
              fontSize: "0.85rem",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor = "var(--color-red-dark)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = "var(--color-red)";
            }}
          >
            {content.cta_label}
          </a>
        </div>
      </div>
    </div>
  );
}
