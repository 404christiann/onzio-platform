// Local-only convenience: CV United is seeded with public_access="preview" /
// lifecycle="onboarding" on purpose (no real owner login exists yet, per the
// build's safety posture -- see HANDOFF.md's "Open items blocking a real CV
// United launch"). That means an anonymous visit 404s by design.
//
// This script flips those two columns in your LOCAL dev database only, so
// you can eyeball the site without setting up an authenticated preview
// session. It never touches staging or production.
//
// Usage:
//   eval "$(supabase status -o env 2>/dev/null)"
//   set -a && . ./.env.local && set +a
//   node scripts/local-preview-toggle.mjs on    # make it visible
//   node scripts/local-preview-toggle.mjs off   # put it back (do this when done)

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const mode = process.argv[2];
if (mode !== "on" && mode !== "off") {
  console.error("Usage: node scripts/local-preview-toggle.mjs <on|off>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, realtime: { transport: WebSocket } },
);

const values =
  mode === "on"
    ? { lifecycle: "active", public_access: "live" }
    : { lifecycle: "onboarding", public_access: "preview" };

const { data, error } = await supabase
  .schema("onzio")
  .from("clubs")
  .update(values)
  .eq("slug", "cv-united")
  .select("slug, public_access, lifecycle, store_enabled");

if (error) {
  console.error("ERROR", error);
  process.exit(1);
}
console.log(data);
