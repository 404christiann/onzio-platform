import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { Skeleton } from "@/components/ui/skeleton";
import type { DBSeason } from "@/lib/db-types";

type SeasonSelectProps = {
  seasons: DBSeason[];
  value: string;
  onChange: (seasonId: string) => void;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
};

export default function SeasonSelect({
  seasons,
  value,
  onChange,
  label,
  disabled = false,
  loading = false,
  className = "",
}: SeasonSelectProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <span className="font-display tracking-widest uppercase text-muted-foreground" style={{ fontSize: "0.8rem" }}>
            {label}
          </span>
        )}
        <AdminSkeletonRegion label="Loading seasons" className={className}>
          <Skeleton className="h-10 w-full min-w-36 rounded-lg" />
        </AdminSkeletonRegion>
      </div>
    );
  }

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
