import { notFound, redirect } from 'next/navigation';
import { getClubContextBySlug } from '@/lib/club-context';
import { pageVisible } from '@/lib/public-page-visibility';
import { fetchPublicPageVisibility } from '@/lib/public-page-visibility-query';

export default async function StadiumParkingPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== 'cinematic@2') notFound();
  // This address only forwards to Robinson Stadium, so it is a 404 too while that page is hidden.
  const visibility = await fetchPublicPageVisibility(club.id);
  if (!pageVisible({ publicPageVisibility: visibility }, 'stadium')) notFound();
  redirect('/stadium#parking-lot-no-5');
}
