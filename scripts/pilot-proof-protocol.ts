import { z } from "zod";

export const proofIdentitySchema = z.object({
  root: z.string().min(1),
  buildId: z.string().min(1),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  origin: z.string().refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" && url.hostname === "alpha.localhost" && Number(url.port) > 0 && url.origin === value;
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
