"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getFlagUrl } from "@/lib/flags";

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
  const src = getFlagUrl(nationality);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

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
