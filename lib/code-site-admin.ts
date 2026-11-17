import { diverseCitySite } from "@/components/sites/diverse-city/site-definition";
import { codeSiteFor, codeSiteForTemplateKey, type CodeSiteInput } from "@/lib/code-site";

export function codeSiteAdminFor(club: CodeSiteInput) {
  return codeSiteFor(club) === diverseCitySite.id ? diverseCitySite.admin : null;
}

export function codeSiteAdminForTemplateKey(key: string | null) {
  return codeSiteForTemplateKey(key) === diverseCitySite.id ? diverseCitySite.admin : null;
}
