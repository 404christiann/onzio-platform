export type CodeSiteId = "diverse-city";
export type CodeSiteInput = Readonly<{ presentationTemplateKey: string | null }>;

export function codeSiteForTemplateKey(key: string | null): CodeSiteId | null {
  return key === "academy@1" ? "diverse-city" : null;
}

export function codeSiteFor(club: CodeSiteInput): CodeSiteId | null {
  return codeSiteForTemplateKey(club.presentationTemplateKey);
}
