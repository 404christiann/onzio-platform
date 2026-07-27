"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const partners = [
  { name: "Chronic Tacos", src: "/images/partners/chronicTacosSponsor.png" },
  { name: "Modern Woodmen", src: "/images/partners/modernWoodward_sponsor.png" },
  { name: "Niky's Sports", src: "/images/partners/nickySports_sponsor.png" },
  { name: "Planted Beauty Rx", src: "/images/partners/plantedBeautySponsor.png" },
  { name: "Tepito Coffee", src: "/images/partners/tepitoSponsor.png" },
  { name: "The Pack Shot Agency", src: "/images/partners/tpaSponsor.png" },
];

// Duplicate for seamless loop
const allPartners = [...partners, ...partners];

export default function PartnerStrip() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll reveal for the section
    const ctx = gsap.context(() => {
      gsap.fromTo(
        sectionRef.current,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 90%",
          },
        }
      );
    }, sectionRef);

    // Continuous horizontal scroll animation
    const track = trackRef.current;
    if (!track) return () => ctx.revert();

    const totalWidth = track.scrollWidth / 2;
    const scrollAnim = gsap.to(track, {
      x: -totalWidth,
      duration: 28,
      ease: "none",
      repeat: -1,
    });

    // Pause on hover
    const pause = () => scrollAnim.pause();
    const resume = () => scrollAnim.resume();
    track.addEventListener("mouseenter", pause);
    track.addEventListener("mouseleave", resume);

    return () => {
      ctx.revert();
      scrollAnim.kill();
      track.removeEventListener("mouseenter", pause);
      track.removeEventListener("mouseleave", resume);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-16 overflow-hidden border-b"
      style={{
        backgroundColor: "var(--color-gray-light)",
        borderColor: "#e5e5e5",
        opacity: 0,
      }}
    >
      <p
        className="font-display text-xs font-semibold tracking-widest uppercase text-center mb-10"
        style={{ color: "var(--color-gray-mid)" }}
      >
        Our Partners
      </p>

      <div className="relative overflow-hidden">
        <div ref={trackRef} className="flex items-center gap-16 w-max">
          {allPartners.map((partner, i) => (
            <div
              key={`${partner.name}-${i}`}
              className="relative flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity duration-300"
              style={{ width: "130px", height: "48px" }}
            >
              <Image
                src={partner.src}
                alt={partner.name}
                fill
                className="object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
