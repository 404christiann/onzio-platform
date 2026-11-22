import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
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
    const content = await fetchTicketsContent(club.id, (await createClient()).schema("onzio"));
    return <CinematicTickets content={content} pageVisibility={club.publicPageVisibility}/>;
}
