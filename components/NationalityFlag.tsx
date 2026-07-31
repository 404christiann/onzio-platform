"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { getFlagCountryCode, getFlagUrl } from "@/lib/flags";

interface NationalityFlagProps {
  nationality: string;
  width?: number;
  className?: string;
}

export default function NationalityFlag({
  nationality,
  width = 34,
  className = "",
}: NationalityFlagProps) {
  const club = useClubContext();
  const usesMigratedFlagMedia = club.slug === "rose-city";
  const src = usesMigratedFlagMedia
    ? getFlagUrl(nationality, club.slug)
    : null;
  const countryCode = usesMigratedFlagMedia
    ? null
    : getFlagCountryCode(nationality);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (countryCode) {
    return (
      <span
        role="img"
        aria-label={`${nationality} flag`}
        className={`fi fi-${countryCode} inline-block flex-shrink-0 overflow-hidden rounded-[3px] ${className}`}
        style={{ width, height: Math.round(width * (432 / 741)) }}
      />
    );
  }

  if (!src || failed) return null;

  return (
    <Image
      src={src}
      alt={`${nationality} flag`}
      width={width}
      height={Math.round(width * (432 / 741))}
      className={`h-auto flex-shrink-0 rounded-[3px] ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
