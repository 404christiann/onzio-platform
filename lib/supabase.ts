import { createClient } from "@/lib/supabase-browser";

// Reuses the same cookie-backed browser client as admin auth (lib/supabase-browser.ts)
// rather than constructing a second @supabase/ssr browser client: createBrowserClient
// caches a single instance per browser session regardless of the options passed to it,
// so a second call here with its own options would silently be ignored in favor of
// whichever client initialized first. Previously this file used the plain
// @supabase/supabase-js client, which persists its session in localStorage instead of
// cookies — invisible to middleware.ts's cookie-based session, so public content
// queries always ran anonymous even for a signed-in club owner.
export const supabase = createClient().schema("onzio");
