import { z } from "zod";

// TELEMETRY-02: the wire contract of the public page beacon (POST /api/t).
// Pure types and zod only: no server, node:, or "@/lib/..." imports, so the
// public-site package can import it. The server turns a body into the signed
// payload for onzio.record_page_event in lib/telemetry/beacon.ts.

export const MAX_BEACON_BYTES = 2048;
export const MAX_LOGO_IDS = 10;
export const ENGAGED_MS_MIN = 1000;
export const ENGAGED_MS_MAX = 60000;

const viewSchema = z
  .object({
    t: z.literal("view"),
    p: z.string().max(2048),
    r: z.string().max(2048).optional(),
    q: z.string().max(2048).optional(),
  })
  .strict();

const logoSeenSchema = z
  .object({
    t: z.literal("logo_seen"),
    p: z.string().max(2048),
    s: z
      .array(z.string().uuid())
      .min(1)
      .max(MAX_LOGO_IDS)
      .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, {
        message: "Sponsor ids must be distinct.",
      }),
  })
  .strict();

const heartbeatSchema = z
  .object({
    t: z.literal("heartbeat"),
    p: z.string().max(2048),
    e: z.number().int().min(ENGAGED_MS_MIN).max(ENGAGED_MS_MAX),
  })
  .strict();

export const beaconBodySchema = z.discriminatedUnion("t", [viewSchema, logoSeenSchema, heartbeatSchema]);

export type ViewBeaconBody = z.infer<typeof viewSchema>;
export type LogoSeenBeaconBody = z.infer<typeof logoSeenSchema>;
export type HeartbeatBeaconBody = z.infer<typeof heartbeatSchema>;
export type BeaconBody = z.infer<typeof beaconBodySchema>;
