import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchSiteSponsorLogos } from "@/lib/queries";
import type { supabase } from "@/lib/supabase";

/**
 * The News pages' partner strip sponsors, read on the server with the request client. Undefined on a failed read, so
 * the strip falls back to its browser fetch instead of the page failing.
 */
export async function newsPartnerSponsors(clubId: string, client: typeof supabase): Promise<DBSiteSponsorLogo[] | undefined> {
  return fetchSiteSponsorLogos("carousel", clubId, client).catch((error: unknown) => {
    console.error("News partner sponsors:", error);
    return undefined;
  });
}
