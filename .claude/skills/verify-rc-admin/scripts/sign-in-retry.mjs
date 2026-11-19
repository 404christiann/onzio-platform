// Bounded retry for sign-in.mjs. Local auth sends one code per address per ~60 s, so a sign-in that starts right after
// another session's run (same address) gets no "Enter your code" screen or no mail. Wait out the window and try again, never forever.
export const SIGN_IN_MAX_ATTEMPTS = 3;
export const SIGN_IN_CODE_WINDOW_MS = 65_000;

/** After a failed attempt: retry (and how long to wait first) or give up. `elapsedMs` = time since that attempt asked for its code. */
export function nextSignInWait({ attempt, elapsedMs }) {
  if (attempt >= SIGN_IN_MAX_ATTEMPTS) return { retry: false, waitMs: 0 };
  return { retry: true, waitMs: Math.max(0, SIGN_IN_CODE_WINDOW_MS - elapsedMs) };
}
