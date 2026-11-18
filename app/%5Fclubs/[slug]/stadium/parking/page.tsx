import { notFound, redirect } from 'next/navigation';
import { getClubContextBySlug } from '@/lib/club-context';

export default async function StadiumParkingPage({ params }: { params: Promise<{ slug: string }> }) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== 'cinematic@2') notFound();
  redirect('/stadium#parking-lot-no-5');
}
