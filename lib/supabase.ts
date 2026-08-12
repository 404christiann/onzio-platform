import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Node <22 (server/SSR/tests) has no native WebSocket, which crashes
// realtime-js's RealtimeClient; only require() the Node-only "ws" package in
// that case (never in the browser, which has native WebSocket) so the real
// implementation never ships in the client bundle (webpack resolves "ws" to
// its no-op browser.js stub there via its package.json "browser" field).
const realtimeTransport =
  typeof globalThis.WebSocket === "undefined"
    ? (require("ws") as unknown as typeof globalThis.WebSocket)
    : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: "onzio" },
  ...(realtimeTransport ? { realtime: { transport: realtimeTransport } } : {}),
});
