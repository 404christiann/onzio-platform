/* Categorical series palette for the Registration Mix doughnut and its table
   legend. Chart.js paints to a canvas and cannot read `.admin-theme` CSS
   tokens, so the series colors are literal by necessity; they live here once so
   the chart slices and the legend swatches can never drift apart. Chart chrome
   (tooltip, border, tick text) is still resolved from the theme tokens. */
export const REGISTRATION_MIX_COLORS = [
  "#5750f1",
  "#8098f9",
  "#0ba5ec",
  "#12b76a",
  "#f79009",
  "#98a2b3",
] as const;

export type RegistrationMixItem = {
  id: string;
  label: string;
  count: number;
  percentage: number;
};

type MixForm = { id: string; title: string; createdAt: string };
type PaidRegistration = { formId: string };

// The single definition of "current forms" for paid counts: paid rows on archived (non-current) forms are excluded.
export function paidRowsOnCurrentForms(
  forms: readonly { id: string }[],
  registrations: readonly PaidRegistration[],
): PaidRegistration[] {
  const current = new Set(forms.map((form) => form.id));
  return registrations.filter((registration) => current.has(registration.formId));
}

export function buildRegistrationMix(
  forms: readonly MixForm[],
  registrations: readonly PaidRegistration[],
): RegistrationMixItem[] {
  const counts = new Map(forms.map((form) => [form.id, 0]));
  for (const registration of paidRowsOnCurrentForms(forms, registrations)) {
    counts.set(registration.formId, (counts.get(registration.formId) ?? 0) + 1);
  }

  const sorted = forms
    .map((form) => ({
      id: form.id,
      label: form.title,
      createdAt: form.createdAt,
      count: counts.get(form.id) ?? 0,
    }))
    .filter((item) => item.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );

  if (!sorted.length) return [];

  const leading = sorted.slice(0, 5);
  const remainder = sorted.slice(5);
  const grouped = remainder.length
    ? [
        ...leading,
        {
          id: "other",
          label: "Other",
          createdAt: "",
          count: remainder.reduce((sum, item) => sum + item.count, 0),
        },
      ]
    : leading;
  const total = grouped.reduce((sum, item) => sum + item.count, 0);

  // Integer arithmetic only (largest-remainder method): float division can
  // push an exact share just under a whole number and skew the tie-break.
  const shares = grouped.map((item, index) => ({
    index,
    floor: Math.floor((item.count * 100) / total),
    remainder: (item.count * 100) % total,
  }));
  let pointsLeft = 100 - shares.reduce((sum, share) => sum + share.floor, 0);
  for (const share of [...shares].sort(
    (left, right) => right.remainder - left.remainder || left.index - right.index,
  )) {
    if (pointsLeft <= 0) break;
    share.floor += 1;
    pointsLeft -= 1;
  }

  return grouped.map((item, index) => ({
    id: item.id,
    label: item.label,
    count: item.count,
    percentage: shares[index].floor,
  }));
}
