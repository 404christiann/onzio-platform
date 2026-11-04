import { z } from "zod";

export const CONTACT_ACTIONS = ["media", "tryouts", "tickets", "information", "partnerships"] as const;
export type ContactAction = (typeof CONTACT_ACTIONS)[number];

export const CONTACT_ROUTES: Record<Exclude<ContactAction, "information">, string> = {
  media: "/stadium/media-credentials",
  tryouts: "/tryouts",
  tickets: "/tickets",
  partnerships: "/community/partnership",
};

export function isSafeContactInformationHref(value: string): boolean {
  if (value === "") return true;
  if (value.trim() !== value) return false;
  if (/[\s\\]/.test(value)) return false;
  if (/^\/(?!\/)[-A-Za-z0-9_/?#=&%.]+$/.test(value)) return true;
  if (/^mailto:[^@\s?]+@[^@\s?]+\.[^@\s?]+$/.test(value)) return true;
  if (value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".")
      && !/^(?:localhost|127\.|0\.)|\.localhost$/i.test(url.hostname);
  } catch { return false; }
}

const draftRow = z.object({ prompt: z.string().max(120), action: z.string().max(60) }).strict();
export const cinematicContactDraftSchema = z.object({
  title: z.string().max(120), subtitle: z.string().max(120),
  rows: z.object({ media: draftRow, tryouts: draftRow, tickets: draftRow, information: draftRow, partnerships: draftRow }).strict(),
  informationHref: z.string().max(2000),
}).strict();
export const cinematicContactContentSchema = cinematicContactDraftSchema.superRefine((value, context) => {
  if (!value.title.trim()) context.addIssue({ code: "custom", path: ["title"], message: "Enter a title." });
  if (!value.subtitle.trim()) context.addIssue({ code: "custom", path: ["subtitle"], message: "Enter a subtitle." });
  for (const id of CONTACT_ACTIONS) {
    if (!value.rows[id].prompt.trim()) context.addIssue({ code: "custom", path: ["rows", id, "prompt"], message: "Enter row text." });
    if (!value.rows[id].action.trim()) context.addIssue({ code: "custom", path: ["rows", id, "action"], message: "Enter button text." });
  }
  if (!isSafeContactInformationHref(value.informationHref)) context.addIssue({ code: "custom", path: ["informationHref"], message: "Use an HTTPS URL, site path, or email address." });
});
export type CinematicContactContent = z.infer<typeof cinematicContactContentSchema>;

export const cinematicContactSaveSchema = z.object({
  operationId: z.uuid(), expectedRevision: z.string().regex(/^[0-9]{1,20}$/), designRevision: z.string().min(1).max(100),
  content: cinematicContactContentSchema,
}).strict();
export type CinematicContactSave = z.infer<typeof cinematicContactSaveSchema>;
export type CinematicContactSnapshot = {
  revision: string; designRevision: string; content: CinematicContactContent | null;
  operation?: { status: "not-committed" } | { status: "committed"; receipt: CinematicContactSnapshot };
};

export function starterCinematicContactContent(): CinematicContactContent {
  return {
    title: "Contact us", subtitle: "Get in touch",
    rows: {
      media: { prompt: "Media inquiries", action: "Media" },
      tryouts: { prompt: "Tryouts", action: "Tryouts" },
      tickets: { prompt: "Ticket questions", action: "Tickets" },
      information: { prompt: "General questions", action: "Information" },
      partnerships: { prompt: "Partnerships", action: "Partnerships" },
    },
    informationHref: "",
  };
}

export function contactHref(content: CinematicContactContent, action: ContactAction): string {
  return action === "information" ? content.informationHref : CONTACT_ROUTES[action];
}
