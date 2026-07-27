"use client";

import { useState } from "react";
import Image from "next/image";
import { Staff } from "@/lib/data";
import StaffModal from "@/components/StaffModal";
import NationalityFlag from "@/components/NationalityFlag";


export default function StaffCard({ member }: { member: Staff }) {
  const [modalOpen, setModalOpen] = useState(false);
  const roleFontSize = member.role.length > 34
    ? "clamp(0.75rem, 1.15vw, 0.92rem)"
    : "clamp(0.82rem, 1.5vw, 1.12rem)";
  const nameFontSize = member.name.length > 14
    ? "clamp(0.82rem, 1.75vw, 1.25rem)"
    : "clamp(1.05rem, 2.1vw, 1.5rem)";

  return (
    <>
      <button
        type="button"
        className="group relative block aspect-[3/5] w-full cursor-pointer overflow-hidden text-left sm:aspect-[3/4]"
        style={{ backgroundColor: "var(--color-white)" }}
        onClick={() => setModalOpen(true)}
        aria-label={`View ${member.name} profile`}
      >
        {/* Photo */}
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src={member.image}
            alt={member.name}
            fill
            className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        </div>

        {/* Photo fade */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[48%]"
          style={{
            background: "linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.94) 38%, rgba(255,255,255,0.45) 60%, transparent 88%)",
          }}
        />

        {/* Staff identity */}
        <div className="absolute inset-x-0 bottom-0 z-[3] bg-transparent px-3 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-12">
          {/* Name + flag */}
          <div className="flex items-center justify-between gap-3">
            <h3
              className="min-w-0 break-words font-display font-bold uppercase leading-tight"
              style={{ fontSize: nameFontSize, color: "var(--color-black)" }}
            >
              {member.name}
            </h3>
            {member.nationality && (
              <NationalityFlag nationality={member.nationality} />
            )}
          </div>

          {/* Initials badge + staff title */}
          <div className="mt-3 flex items-center gap-2.5 sm:gap-3">
            <span
              className="flex h-8 min-w-8 flex-none items-center justify-center px-1 font-display font-black uppercase leading-none sm:h-10 sm:min-w-10"
              style={{
                backgroundColor: "var(--color-red)",
                color: "var(--color-black)",
                fontSize: "clamp(0.68rem, 1.25vw, 0.9rem)",
              }}
            >
              {member.initials}
            </span>
            <p
              className="min-w-0 flex-1 break-words font-body font-medium italic leading-[1.2]"
              style={{ fontSize: roleFontSize, color: "var(--color-red)" }}
            >
              {member.role}
            </p>
          </div>
        </div>
      </button>

      {modalOpen && (
        <StaffModal member={member} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
