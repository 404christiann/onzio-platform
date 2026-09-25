import type { CSSProperties } from "react";
import Image from "@/components/ResilientImage";

/**
 * Shared public-site attribution used by every presentation template.
 *
 * The badge opens Onzio's public website. The vertical crop bounds the wordmark's
 * "onzio" body only (rows 224-287 of the 500x500 source), allowing the i-dot
 * to overhang like a lowercase ascender without shifting the visual centre.
 */
export default function PoweredByOnzio({
  className,
  textClassName,
  textStyle,
}: {
  className?: string;
  textClassName: string;
  textStyle?: CSSProperties;
}) {
  return (
    <div className={`flex justify-center ${className ?? ""}`}>
      <a
        href="https://onziofutbol.com/"
        className="inline-flex items-center gap-1.5 opacity-70 transition-opacity duration-200 hover:opacity-100"
      >
        <span className={textClassName} style={textStyle}>
          Powered by
        </span>
        <Image
          src="/images/onzio/onzio-wordmark-white.png"
          alt="Onzio"
          width={100}
          height={100}
          className="-ml-[15px] -mr-[15px] -mt-[44.8px] -mb-[42.4px] max-w-none"
        />
      </a>
    </div>
  );
}
