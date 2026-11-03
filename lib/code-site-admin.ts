import { diverseCitySite } from "@/components/sites/diverse-city/site-definition";
import type { ClubContext } from "@/lib/club-context";
import { codeSiteFor } from "@/lib/code-site";

export function codeSiteAdminFor(club: Pick<ClubContext, "presentationTemplateKey">) {
  return codeSiteFor(club) === diverseCitySite.id ? diverseCitySite.admin : null;
}
