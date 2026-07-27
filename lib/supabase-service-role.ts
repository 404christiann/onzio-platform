import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Bypasses RLS entirely. Imports are architecture-scanned and restricted to
// the approved server-only webhook, operator, migration, and media boundaries.
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    },
  );
}
