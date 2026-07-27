import type { DBSeason } from "@/lib/db-types";

type SeasonSelectProps = {
  seasons: DBSeason[];
  value: string;
  onChange: (seasonId: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
};

export default function SeasonSelect({
  seasons,
  value,
  onChange,
  label,
  disabled = false,
  className = "",
}: SeasonSelectProps) {
  const select = (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={`rounded-lg px-4 py-2.5 font-body outline-none ${className}`}
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "white",
        colorScheme: "dark",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {seasons.length === 0 && <option value="">No seasons available</option>}
      {seasons.map((season) => (
        <option key={season.id} value={season.id}>
          {season.label}{season.active ? " (Active)" : ""}
        </option>
      ))}
    </select>
  );

  if (!label) return select;

  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="font-display tracking-widest uppercase"
        style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}
      >
        {label}
      </span>
      {select}
    </label>
  );
}
