export type PathwayImageFallbackProps = {
  label: string;
  className?: string;
};

/**
 * Token-driven failed/missing image state for pathway@1 media surfaces.
 * Keeping the treatment here prevents a shared legacy-club palette from
 * leaking into pathway pages when an image origin is unavailable.
 */
export default function PathwayImageFallback({
  label,
  className,
}: PathwayImageFallbackProps) {
  return (
    <div
      className={["pathway-image-fallback", className].filter(Boolean).join(" ")}
      data-image-fallback="true"
      role="img"
      aria-label={label}
    >
      <span>{label}</span>
    </div>
  );
}
