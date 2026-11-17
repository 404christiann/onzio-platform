import type { DBSiteSponsorLogo } from "@/lib/db-types";
export async function fetchSponsorList(clubId: string): Promise<DBSiteSponsorLogo[]> {
  const response = await fetch(`/__cl23__/read?club=${encodeURIComponent(clubId)}`);
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
