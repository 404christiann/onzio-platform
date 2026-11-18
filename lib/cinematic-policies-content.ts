import { z } from "zod";

/** The two owner-edited accordion pages: /stadium/guidelines and /stadium/fan-code. */
export const POLICY_PAGES = ["guidelines", "fanCode"] as const;
export type PolicyPageKey = (typeof POLICY_PAGES)[number];
export const POLICY_PAGE_PATHS: Record<PolicyPageKey, string> = { guidelines: "/stadium/guidelines", fanCode: "/stadium/fan-code" };

export const POLICY_LIMITS = { rows: 30, blocks: 12, title: 120, heading: 160, subheading: 160, paragraph: 2000 } as const;

const filled = (value: string) => value.trim() !== "";
const block = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("subheading"), text: z.string().max(POLICY_LIMITS.subheading) }).strict(),
  z.object({ kind: z.literal("paragraph"), text: z.string().max(POLICY_LIMITS.paragraph) }).strict(),
]);
const draftRow = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  heading: z.string().max(POLICY_LIMITS.heading),
  blocks: z.array(block).max(POLICY_LIMITS.blocks),
}).strict();
const draftPage = z.object({
  title: z.string().max(POLICY_LIMITS.title),
  subtitle: z.string().max(POLICY_LIMITS.title),
  heading: z.string().max(POLICY_LIMITS.title),
  rows: z.array(draftRow).max(POLICY_LIMITS.rows),
}).strict();

/** What the editor may hold while the owner types: lengths and shape only. */
export const cinematicPolicyDraftSchema = z.object({ guidelines: draftPage, fanCode: draftPage }).strict();
export type CinematicPolicyDraft = z.infer<typeof cinematicPolicyDraftSchema>;

/** What may be saved and published. */
export const cinematicPolicyContentSchema = cinematicPolicyDraftSchema.superRefine((value, context) => {
  for (const key of POLICY_PAGES) {
    const page = value[key];
    if (!filled(page.title)) context.addIssue({ code: "custom", path: [key, "title"], message: "Enter a page title." });
    const seen = new Set<string>();
    page.rows.forEach((row, index) => {
      if (seen.has(row.id)) context.addIssue({ code: "custom", path: [key, "rows", index, "id"], message: "Row ids must be unique." });
      seen.add(row.id);
      if (!filled(row.heading)) context.addIssue({ code: "custom", path: [key, "rows", index, "heading"], message: "Enter a row heading." });
      row.blocks.forEach((line, lineIndex) => {
        if (!filled(line.text)) context.addIssue({ code: "custom", path: [key, "rows", index, "blocks", lineIndex, "text"], message: "Enter text or remove this line." });
      });
    });
  }
});
export type CinematicPolicyContent = z.infer<typeof cinematicPolicyContentSchema>;
export type CinematicPolicyPage = CinematicPolicyContent[PolicyPageKey];
export type CinematicPolicyRow = CinematicPolicyPage["rows"][number];
export type CinematicPolicyBlock = CinematicPolicyRow["blocks"][number];

export const cinematicPolicySaveSchema = z.object({
  operationId: z.uuid(), expectedRevision: z.string().regex(/^[0-9]{1,20}$/), designRevision: z.string().min(1).max(100),
  content: cinematicPolicyContentSchema,
}).strict();
export type CinematicPolicySave = z.infer<typeof cinematicPolicySaveSchema>;
export type CinematicPolicySnapshot = {
  revision: string; designRevision: string; content: CinematicPolicyContent | null;
  operation?: { status: "not-committed" } | { status: "committed"; receipt: CinematicPolicySnapshot };
};

export function starterCinematicPolicyContent(): CinematicPolicyContent {
  return {
    guidelines: { title: "Stadium Guidelines", subtitle: "& FAQ’s", heading: "Guidelines", rows: [] },
    fanCode: { title: "Fan Code of Conduct", subtitle: "& FAQ’s", heading: "Code of Conduct", rows: [] },
  };
}
