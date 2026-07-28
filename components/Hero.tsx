"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { useClubContext } from "@/components/ClubContextProvider";
import ResilientNativeImage from "@/components/ResilientNativeImage";

export default function Hero() {
  const club = useClubContext();
  const usesLegacyRoseCityHero = club.slug === "rose-city";
  const ctaRef   = useRef<HTMLDivElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const hasAnimated = useRef(false);
  const [videoMounted, setVideoMounted] = useState(false);

  // Render video only client-side — iOS Safari ignores autoplay on SSR-rendered video elements
  useEffect(() => { setVideoMounted(true); }, []);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    gsap.fromTo(
      ctaRef.current,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", delay: 0.8 }
    );
  }, []);

  // iOS Safari autoplay: muted + playsInline is not enough on a cold page load
  // because the browser hasn't seen a user gesture yet. Strategy:
  //   1. Try .play() immediately — works on client-side navigation & most browsers.
  //   2. If rejected, register a one-shot touchstart listener so the video
  //      starts the instant the user first touches the screen (scroll, tap, anything).
  //   3. Also retry on canplay/loadeddata for slow connections.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;

    let unlocked = false;

    const playVideo = () => {
      if (!video.paused) return;
      video.play().catch(() => {});
    };

    const onFirstTouch = () => {
      if (unlocked) return;
      unlocked = true;
      playVideo();
      document.removeEventListener("touchstart", onFirstTouch);
    };

    const tryPlay = () => {
      video.play().catch(() => {
        // Autoplay blocked — wait for first user touch
        document.addEventListener("touchstart", onFirstTouch, { once: true });
      });
    };

    video.load();
    tryPlay();
    video.addEventListener("canplay", playVideo);
    video.addEventListener("loadeddata", playVideo);

    const onVisibility = () => { if (!document.hidden) playVideo(); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      video.removeEventListener("canplay", playVideo);
      video.removeEventListener("loadeddata", playVideo);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("touchstart", onFirstTouch);
    };
  }, [videoMounted]);

  return (
    <section className="relative h-screen min-h-[600px] w-full overflow-hidden md:h-[50vh] md:min-h-[380px]">
      {/* Background video — rendered client-side only so iOS Safari treats it as a
          fresh element and respects the muted autoplay policy */}
      <div className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
        {/* Poster shown until the video element is created client-side */}
        {!videoMounted && (
          <ResilientNativeImage
            src="/images/hero-poster.jpg"
            alt=""
            hideOnError
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "177.78vh",
              height: "56.25vw",
              minWidth: "100%",
              minHeight: "100%",
              transform: "translate(-50%, -50%)",
              objectFit: "cover",
            }}
          />
        )}
        {videoMounted && usesLegacyRoseCityHero && (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="/images/hero-poster.jpg"
            src="https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/videos/Pan_Bench_Land_ready.mp4"
            onCanPlay={() => { videoRef.current?.play().catch(() => {}); }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "177.78vh",
              height: "56.25vw",
              minWidth: "100%",
              minHeight: "100%",
              transform: "translate(-50%, -50%)",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* Dark overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: usesLegacyRoseCityHero
            ? "rgba(0,0,0,0.52)"
            : "linear-gradient(135deg, var(--color-black), var(--color-red-dark))",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div
        className="absolute inset-0 flex flex-col items-end justify-end px-6 pb-28 text-center md:pb-16"
        style={{ zIndex: 3 }}
      >
        {!usesLegacyRoseCityHero && (
          <h1 className="mb-10 w-full text-center font-display text-5xl font-black uppercase text-white sm:text-7xl">
            {club.name}
          </h1>
        )}
        <div
          ref={ctaRef}
          className="flex flex-col sm:flex-row gap-4 w-full justify-center"
          style={{ opacity: 0 }}
        >
          <Link
            href="/shop"
            className="font-display font-bold text-sm tracking-widest uppercase px-8 py-4 transition-all duration-200"
            style={{ backgroundColor: "var(--color-red)", color: "#fff" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-red-dark)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-red)")
            }
          >
            Team Store
          </Link>
          <Link
            href="/roster"
            className="font-display font-bold text-sm tracking-widest uppercase px-8 py-4 border border-white/50 text-white transition-all duration-200 hover:border-white hover:bg-white/10"
          >
            Meet the Squad
          </Link>
        </div>
      </div>

      {/* Scroll hint */}
      <div
        className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 md:hidden"
        style={{ zIndex: 4 }}
      >
        <span className="font-display text-xs tracking-widest uppercase text-white/50">
          Scroll
        </span>
        <div className="w-px h-8 bg-white/30" />
      </div>
    </section>
  );
}
