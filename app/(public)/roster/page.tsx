"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import PlayerCard from "@/components/PlayerCard";
import StaffCard from "@/components/StaffCard";
import { fetchRoster, fetchStaff } from "@/lib/queries";
import { Player, Staff } from "@/lib/data";
import { useClubContext, useClubId } from "@/components/ClubContextProvider";
import ClubhouseRosterPage from "@/components/ClubhouseRosterPage";
import EditorialRoster from "@/components/editorial/EditorialRoster";
import PathwayUpslRoster from "@/components/pathway/PathwayUpslRoster";
import { upslRosterContent } from "@/components/pathway/content";

gsap.registerPlugin(ScrollTrigger);

type RosterData = {
  goalkeepers: Player[];
  defenders: Player[];
  midfielders: Player[];
  forwards: Player[];
  seasonLabel: string;
};

function RosterGroup({ label, players, seasonLabel }: { label: string; players: Player[]; seasonLabel: string }) {
  const club = useClubContext();
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        groupRef.current,
        { y: 40, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: groupRef.current, start: "top 85%" },
        }
      );
    }, groupRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={groupRef} className="mb-20" style={{ opacity: 0 }}>
      <div className="flex items-center gap-4 mb-8">
        <h2
          className="font-display font-black uppercase leading-none"
          style={{ fontSize: "clamp(2rem, 4vw, 3rem)", color: "var(--color-black)" }}
        >
          {label}
        </h2>
        <div
          className="flex-1 h-px"
          style={{ backgroundColor: isAcademy ? "#B9E3F6" : "#e5e5e5" }}
        />
        <span
          className={`font-display text-sm font-semibold uppercase ${isAcademy ? "" : "tracking-widest"}`}
          style={{ color: isAcademy ? "#51667E" : "var(--color-gray-mid)" }}
        >
          {players.length}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {players.map((player) => (
          <PlayerCard key={player.number} player={player} seasonLabel={seasonLabel} />
        ))}
      </div>
    </div>
  );
}

export default function RosterPage() {
  const club = useClubContext();
  if (club.presentationTemplateKey === "pathway@1") return <PathwayUpslRoster {...upslRosterContent} />;
  if (club.presentationTemplateKey === "editorial@1") return <EditorialRoster />;
  if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseRosterPage />;
  return <LegacyRosterPage />;
}

function LegacyRosterPage() {
  const club = useClubContext();
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const clubId = useClubId();
  const heroRef  = useRef<HTMLDivElement>(null);
  const staffRef = useRef<HTMLDivElement>(null);

  const [roster, setRoster] = useState<RosterData | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchRoster(undefined, clubId), fetchStaff(clubId)])
      .then(([rosterData, staffData]) => {
        setRoster(rosterData);
        setStaffList(staffData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [clubId]);

  useEffect(() => {
    if (loading) return;
    gsap.fromTo(
      heroRef.current,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", delay: 0.2 }
    );

    const ctx = gsap.context(() => {
      gsap.fromTo(
        staffRef.current,
        { y: 40, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: staffRef.current, start: "top 85%" },
        }
      );
    });
    return () => ctx.revert();
  }, [loading]);

  const groups = roster
    ? [
        { label: "Goalkeepers", players: roster.goalkeepers },
        { label: "Defenders",   players: roster.defenders   },
        { label: "Midfielders", players: roster.midfielders },
        { label: "Forwards",    players: roster.forwards    },
      ]
    : [];

  const seasonLabel = roster?.seasonLabel ?? "";
  const hasRosterContent = groups.some((group) => group.players.length > 0) || staffList.length > 0;

  return (
    <div style={{ backgroundColor: "var(--color-white)" }}>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center" style={{ minHeight: "100vh" }}>
          <p
            className="font-display font-black uppercase tracking-widest"
            style={{ color: "var(--color-gray-mid)", fontSize: "1rem" }}
          >
            Loading squad…
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-center justify-center" style={{ minHeight: "100vh" }}>
          <p
            className="font-display font-bold uppercase tracking-widest"
            style={{ color: "var(--color-red)", fontSize: "0.9rem" }}
          >
            Failed to load roster. Please refresh.
          </p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && roster && (
        <>
          {/* Page hero */}
          <div
            ref={heroRef}
            className="pt-36 pb-14 px-6 lg:px-10 max-w-7xl mx-auto"
            style={{ opacity: 0 }}
          >
            <p
              className={`font-display font-bold uppercase mb-3 ${isAcademy ? "" : "tracking-widest"}`}
              style={{ color: "var(--color-red)", fontSize: "clamp(0.85rem, 1.5vw, 1.1rem)" }}
            >
              {seasonLabel} Season
            </p>
            <h1
              className="font-display font-black uppercase leading-none"
              style={{ fontSize: "clamp(4rem, 10vw, 8rem)", color: "var(--color-black)" }}
            >
              The Squad
            </h1>
            <div className="w-16 h-1 mt-6" style={{ backgroundColor: "var(--color-red)" }} />
          </div>

          {/* Player groups */}
          <div className="px-6 lg:px-10 max-w-7xl mx-auto pb-10">
            {!hasRosterContent ? (
              <div className="border-y border-black/10 py-14 text-center">
                <h2 className="font-display text-2xl font-black uppercase text-[var(--color-black)]">
                  Roster coming soon
                </h2>
                <p className="mx-auto mt-3 max-w-xl font-body text-[var(--color-gray-mid)]">
                  Official player and staff details have not been published yet.
                </p>
              </div>
            ) : groups.map((g) => (
              <RosterGroup key={g.label} label={g.label} players={g.players} seasonLabel={seasonLabel} />
            ))}
          </div>

          {/* Technical Staff */}
          {hasRosterContent && <div className="px-6 lg:px-10 max-w-7xl mx-auto pb-24">
            <div ref={staffRef} style={{ opacity: 0 }}>
              <div className="flex items-center gap-4 mb-8">
                <h2
                  className="font-display font-black uppercase leading-none"
                  style={{ fontSize: "clamp(2rem, 4vw, 3rem)", color: "var(--color-black)" }}
                >
                  Technical Staff
                </h2>
                <div className="flex-1 h-px" style={{ backgroundColor: isAcademy ? "#B9E3F6" : "#e5e5e5" }} />
                <span
                  className={`font-display text-sm font-semibold uppercase ${isAcademy ? "" : "tracking-widest"}`}
                  style={{ color: isAcademy ? "#51667E" : "var(--color-gray-mid)" }}
                >
                  {staffList.length}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
                {staffList.map((member) => (
                  <StaffCard key={member.name} member={member} />
                ))}
              </div>
            </div>
          </div>}
        </>
      )}
    </div>
  );
}
