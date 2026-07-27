"use client";

import { useState } from "react";
import Image from "next/image";
import { Player, GoalkeeperStats, FieldStats } from "@/lib/data";
import PlayerModal from "@/components/PlayerModal";
import NationalityFlag from "@/components/NationalityFlag";
import { getRosterImageSrc, isRosterPlaceholderLogo } from "@/lib/roster-images";
import { useClubBranding } from "@/components/ClubBrandingProvider";

function isGK(stats: GoalkeeperStats | FieldStats): stats is GoalkeeperStats {
  return "saves" in stats;
}

export default function PlayerCard({ player, seasonLabel }: { player: Player; seasonLabel?: string }) {
  const { clubLogoUrl } = useClubBranding();
  const [hovered, setHovered] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const stats = player.stats;
  const gk = isGK(stats);
  const isPlaceholderLogo = isRosterPlaceholderLogo(player.image);
  const imageSrc = getRosterImageSrc(player.image, clubLogoUrl);

  return (
    <>
      <div
        className="relative overflow-hidden cursor-pointer group"
        style={{ backgroundColor: "var(--color-white)", aspectRatio: "3/4" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setModalOpen(true)}
      >
        {/* Player photo */}
        <Image
          src={imageSrc}
          alt={player.name}
          fill
          className={`${isPlaceholderLogo ? "object-contain object-top" : "object-cover object-center"} transition-transform duration-500 md:group-hover:scale-105`}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        />

        {/* Always-visible gradient + info at bottom */}
        <div
          className="absolute inset-x-0 bottom-0 pt-6 md:pt-12 pb-4 px-4"
          style={{
            background: "linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.94) 38%, rgba(255,255,255,0.45) 60%, transparent 88%)",
            zIndex: 2,
          }}
        >
          <div>
            <div className="flex items-end justify-between gap-3">
              {/* Jersey number */}
              <span
                className="font-display font-black leading-none block"
                style={{
                  fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
                  color: "var(--color-red)",
                  lineHeight: 1,
                }}
              >
                {player.number}
              </span>

              {player.nationality && (
                <NationalityFlag
                  nationality={player.nationality}
                  className="mb-[0.18rem]"
                />
              )}
            </div>

            {/* Name + captain badge */}
            <h3
              className="font-display font-bold uppercase leading-tight mt-1"
              style={{ fontSize: "clamp(1rem, 2vw, 1.25rem)", color: "var(--color-black)" }}
            >
              {player.name}
              {player.caption && (
                <span className="ml-2 text-sm" style={{ color: "var(--color-red)" }}>
                  {player.caption}
                </span>
              )}
            </h3>

            {/* Position */}
            <p
              className="font-display text-xs tracking-widest uppercase mt-1"
              style={{ color: "rgba(10,10,10,0.62)" }}
            >
              {player.position}
            </p>
          </div>

          {/* Stats overlay — desktop hover only; mobile taps open the modal directly. */}
          <div
            className="hidden overflow-hidden md:block"
            style={{
              maxHeight: hovered ? "120px" : "0px",
              opacity: hovered ? 1 : 0,
              transition: "max-height 0.35s ease, opacity 0.3s ease",
            }}
          >
            <div
              className="mt-3 pt-3 grid grid-cols-3 gap-2 text-center"
              style={{ borderTop: "1px solid rgba(231,0,27,0.25)" }}
            >
              {isGK(stats) ? (
                <>
                  <StatBox label="Saves" value={stats.saves} />
                  <StatBox label="Clean" value={stats.cleanSheets} />
                  <StatBox label="Mins" value={stats.mins} />
                </>
              ) : (
                <>
                  <StatBox label="Goals" value={stats.goals} />
                  <StatBox label="Assists" value={stats.assists} />
                  <StatBox label="Mins" value={stats.mins} />
                </>
              )}
            </div>
            {/* Tap hint */}
            <p
              className="font-display text-xs tracking-widest uppercase text-center mt-3"
              style={{ color: "rgba(10,10,10,0.38)" }}
            >
              Tap for full profile
            </p>
          </div>
        </div>
      </div>

      {/* Full profile modal */}
      {modalOpen && (
        <PlayerModal player={player} seasonLabel={seasonLabel} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-display font-black text-lg leading-none" style={{ color: "var(--color-black)" }}>
        {value}
      </span>
      <span className="font-display text-xs tracking-widest uppercase mt-0.5" style={{ color: "rgba(10,10,10,0.55)" }}>
        {label}
      </span>
    </div>
  );
}
