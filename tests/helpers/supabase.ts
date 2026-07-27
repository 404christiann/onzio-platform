import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import WebSocket from "ws";
import { assertSafeTestEnvironment } from "./environment";

const nodeWebSocket =
  WebSocket as unknown as typeof globalThis.WebSocket;

export type LocalClients = {
  anon: SupabaseClient<any, any, any>;
  service: SupabaseClient<any, any, any>;
};

let plannedDatabaseFailure: Error | null = null;

export function createLocalClients(): LocalClients {
  const { supabaseUrl } = assertSafeTestEnvironment();
  const anonKey =
    process.env.SUPABASE_TEST_ANON_KEY ?? "local-anon-key-not-configured";
  const serviceKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
    "local-service-role-key-not-configured";

  return {
    anon: createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "onzio" },
      realtime: { transport: nodeWebSocket },
    }),
    service: createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "onzio" },
      realtime: { transport: nodeWebSocket },
    }),
  };
}

export async function requirePlannedDatabase(
  client: SupabaseClient<any, any, any>,
): Promise<void> {
  if (plannedDatabaseFailure) throw plannedDatabaseFailure;

  try {
    const { error } = await client
      .from("clubs")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(1_000));
    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    plannedDatabaseFailure = new Error(
      "[RED CONTRACT] Local Supabase is unavailable or the planned onzio.clubs " +
        `contract is missing: ${String(error)}`,
    );
    throw plannedDatabaseFailure;
  }
}
