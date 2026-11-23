import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import { fetchPublicPageVisibility } from "@/lib/public-page-visibility-query";
import { fetchTicketsContent } from "@/lib/tickets-query";
import CinematicTickets from "@/components/cinematic/CinematicTickets";
export default async function TicketsPage({ params }: {
    params: Promise<{
        slug: string;
    }>;
}) {
    const { slug } = await params;
    const club = await getClubContextBySlug(slug);
    if (club.presentationTemplateKey !== "cinematic@2")
        notFound();
    const [content, visibility] = await Promise.all([fetchTicketsContent(club.id, (await createClient()).schema("onzio")), fetchPublicPageVisibility(club.id)]);
    return <CinematicTickets content={content} pageVisibility={visibility}/>;
}
