import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { cn } from "@/lib/utils";

export function CrestCircle({
  src,
  alt,
  fallback,
  variant = "feature",
  className,
}: {
  src?: string | null;
  alt: string;
  fallback: string;
  variant?: "feature" | "row";
  className?: string;
}) {
  const isFeature = variant === "feature";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ed-on-dark)_24%,transparent)] bg-white/95 text-ed-primary shadow-[0_18px_48px_rgba(0,0,0,0.22)]",
        isFeature ? "size-28 md:size-36" : "size-14",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={isFeature ? 144 : 56}
          height={isFeature ? 144 : 56}
          className="size-[78%] object-contain"
          {...imageDeliveryProps(alt.includes("opponent") ? "opponent-crest" : "club-logo")}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "font-display font-black uppercase tracking-[0.04em]",
            isFeature ? "text-3xl" : "text-sm",
          )}
        >
          {fallback}
        </span>
      )}
    </span>
  );
}
