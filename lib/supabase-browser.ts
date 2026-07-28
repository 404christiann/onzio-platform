import { createBrowserClient } from "@supabase/ssr";

function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

let browserClient: BrowserSupabaseClient | undefined;

export function createClient() {
  browserClient ??= createBrowserSupabaseClient();
  return browserClient;
}
