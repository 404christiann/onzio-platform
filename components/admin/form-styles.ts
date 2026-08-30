// Shared admin form-control classes, built on the `.dark`-scoped shadcn
// token layer in styles/globals.css (PLAT-104). Single source of truth so
// input/label styling can't drift across pages the way contact/tryouts/
// programs's locally-duplicated INPUT_CLASS constants did.

export const ADMIN_INPUT_CLASS =
  "w-full rounded-lg border border-input bg-input/30 px-3 py-2.5 font-body text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:bg-input/50";

export const ADMIN_LABEL_CLASS =
  "mb-2 block font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground";
