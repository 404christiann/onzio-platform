export const SIGN_IN_MAX_ATTEMPTS: number;
export const SIGN_IN_CODE_WINDOW_MS: number;
export function nextSignInWait(seen: { attempt: number; elapsedMs: number }): { retry: boolean; waitMs: number };
