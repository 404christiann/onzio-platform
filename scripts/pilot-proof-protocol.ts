import { z } from "zod";

export const proofHostnameSchema = z.enum(["alpha.localhost", "pilot.localhost"]);
export type PilotProofHostname = z.infer<typeof proofHostnameSchema>;

export const proofIdentitySchema = z.object({
  root: z.string().min(1),
  reconstruction: z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().nullable(),
  buildId: z.string().min(1),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  origin: z.string().refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" && proofHostnameSchema.safeParse(url.hostname).success && Number(url.port) > 0 && url.origin === value;
    } catch { return false; }
  }),
}).strict();
export const proofServerMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), identity: proofIdentitySchema }).strict(),
  z.object({ kind: z.literal("verified"), identity: proofIdentitySchema }).strict(),
  z.object({ kind: z.literal("failure") }).strict(),
]);
export const proofServerCommandSchema = z.object({ kind: z.literal("verify") }).strict();
export type ProofIdentity = z.infer<typeof proofIdentitySchema>;
