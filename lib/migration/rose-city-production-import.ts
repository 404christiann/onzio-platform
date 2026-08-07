/**
 * Immutable evidence for the one-time Rose City production import.
 *
 * These values describe the accepted 2026-07-27 cutover inputs. They are not
 * the desired current production configuration and must never be replayed.
 */
export const ROSE_CITY_HISTORICAL_CUTOVER = Object.freeze({
  completedAt: "2026-07-27T23:00:09.000Z",
  productionProjectRef: "ioalthwsdrlzrubomrow",
  productionOrigin: "https://ioalthwsdrlzrubomrow.supabase.co",
  sourceDigest:
    "e7763db3b37022a74b479ef5d421058bc31f2eaeaafe36bdcc8e1dafb6938226",
  planDigest:
    "e826f49771773ad2415ec6b52fe47c6d311750f10e5be31e6fdace4a8d349c13",
  importedSourceRows: 209,
  importedMediaAssets: 515,
  domainsAtCutover: Object.freeze([
    "www.rosecityfutbolclub.com",
    "rosecityfutbolclub.com",
  ]),
  memberEmailsAtCutover: Object.freeze([
    "christianjavieralcala@gmail.com",
    "info@rosecityfutbolclub.com",
  ]),
});

/**
 * Current state recorded during Phase 8 closeout.
 *
 * Keep this separate from the frozen cutover evidence above. In particular,
 * neither retired domain nor the removed Auth identity may be restored by
 * migration tooling.
 */
export const ROSE_CITY_CURRENT_PRODUCTION_STATE = Object.freeze({
  recordedAt: "2026-08-06",
  primaryHostname: "onzio-platform.vercel.app",
  retiredHostnames: Object.freeze([
    "www.rosecityfutbolclub.com",
    "rosecityfutbolclub.com",
    "onzio-rcfc.vercel.app",
  ]),
  activeOwnerEmails: Object.freeze([
    "christianjavieralcala@gmail.com",
  ]),
  removedIdentityEmails: Object.freeze([
    "info@rosecityfutbolclub.com",
  ]),
});

export function assertRoseCityProductionImportRetired(): never {
  throw new Error(
    "Rose City production import is permanently retired after the accepted cutover. Use the immutable evidence for audit only; never replay it.",
  );
}
