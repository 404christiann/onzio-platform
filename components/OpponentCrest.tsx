"use client";

import Image from "@/components/ResilientImage";
import { useEffect, useState } from "react";
import { imageDeliveryProps } from "@/lib/image-delivery";

interface OpponentCrestProps {
  name: string;
  logoUrl?: string | null;
  size?: number;
  /** Use "dark" when the crest sits on a dark/colored background (e.g. the highlighted next-match row) so the backdrop and fallback monogram stay legible. */
  variant?: "light" | "dark";
  className?: string;
}

function fallbackLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toUpperCase() === "TBA") return "TBA";
  return trimmed.charAt(0).toUpperCase() || "?";
}

/** Circular opponent crest. Falls back to an initial monogram if no logo is set or the image fails to load. */
export default function OpponentCrest({ name, logoUrl, size = 96, variant = "light", className = "" }: OpponentCrestProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const showImage = !!logoUrl && !failed;
  const isDark = variant === "dark";
  const label = fallbackLabel(name);
  const fallbackScale = label.length > 1 ? 0.28 : 0.4;

  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center ${className}`}
      style={{
        width: `var(--opponent-crest-size, ${size}px)`,
        height: `var(--opponent-crest-size, ${size}px)`,
        backgroundColor: showImage
          ? "transparent"
          : isDark ? "rgba(255,255,255,0.15)" : "var(--color-gray-light)",
        border: showImage ? "none" : isDark ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(0,0,0,0.08)",
      }}
    >
      {showImage ? (
        <Image
          src={logoUrl!}
          alt={`${name} crest`}
          fill
          className="object-contain"
          sizes={`${size}px`}
          onError={() => setFailed(true)}
          {...imageDeliveryProps("opponent-crest")}
        />
      ) : (
        <span
          className="font-display font-black uppercase leading-none"
          style={{ fontSize: `calc(var(--opponent-crest-size, ${size}px) * ${fallbackScale})`, color: isDark ? "rgba(255,255,255,0.85)" : "var(--color-gray-mid)" }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
