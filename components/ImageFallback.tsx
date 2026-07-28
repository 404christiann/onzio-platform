export type ImageFallbackVariant =
  | "photo"
  | "person"
  | "shop"
  | "trophy"
  | "logo";

const COPY: Record<ImageFallbackVariant, string> = {
  photo: "Image unavailable",
  person: "Photo unavailable",
  shop: "Product image unavailable",
  trophy: "Championship image unavailable",
  logo: "Logo unavailable",
};

export default function ImageFallback({
  label,
  variant = "photo",
  fill = true,
  width,
  height,
}: {
  label: string;
  variant?: ImageFallbackVariant;
  fill?: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <div
      data-image-fallback="true"
      data-image-fallback-variant={variant}
      role="img"
      aria-label={label}
      className={`items-center justify-center overflow-hidden ${
        fill ? "absolute inset-0 flex" : "inline-flex"
      }`}
      style={{
        width: fill ? undefined : width,
        height: fill ? undefined : height,
        minHeight: fill ? undefined : height,
        background:
          variant === "trophy"
            ? "radial-gradient(circle at 50% 40%, rgba(231,0,27,0.18), rgba(255,255,255,0.04) 58%, transparent 75%)"
            : variant === "logo"
              ? "rgba(255,255,255,0.08)"
              : "linear-gradient(135deg, rgba(20,20,20,0.08), rgba(231,0,27,0.08))",
        border: "1px solid rgba(127,127,127,0.18)",
        color: variant === "trophy" ? "rgba(255,255,255,0.72)" : "rgba(20,20,20,0.58)",
      }}
    >
      <span className="px-4 text-center font-display text-xs font-black uppercase tracking-widest">
        {COPY[variant]}
      </span>
    </div>
  );
}
