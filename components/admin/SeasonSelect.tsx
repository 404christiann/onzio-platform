import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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
    <NativeSelect
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={className}
    >
      {seasons.length === 0 && (
        <NativeSelectOption value="">No seasons available</NativeSelectOption>
      )}
      {seasons.map((season) => (
        <NativeSelectOption key={season.id} value={season.id}>
          {season.label}{season.active ? " (Active)" : ""}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );

  if (!label) return select;

  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="font-display tracking-widest uppercase text-muted-foreground"
        style={{ fontSize: "0.8rem" }}
      >
        {label}
      </span>
      {select}
    </label>
  );
}
