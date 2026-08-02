import ResilientImage from "@/components/ResilientImage";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { imageDeliveryProps } from "@/lib/image-delivery";

export default function AcademySponsorsPage({
  sponsors,
}: {
  sponsors: DBSiteSponsorLogo[];
}) {
  return (
    <div className="min-h-screen bg-[#F9FAFD] pt-24 text-[#1E3653] sm:pt-28">
      <section className="overflow-hidden bg-[#1E3653] px-6 py-20 text-white sm:py-28 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <p className="font-nav text-xs font-bold uppercase tracking-[0.24em] text-[#B9E3F6]">
            Community Partners
          </p>
          <h1 className="mt-5 max-w-5xl font-display text-[clamp(3.25rem,8vw,7rem)] font-black uppercase italic leading-[0.88]">
            Backing players.
            <br />
            <span className="text-[#B9E3F6]">Building opportunity.</span>
          </h1>
          <p className="mt-8 max-w-2xl font-body text-lg leading-8 text-white/70">
            Diverse City FC is grateful to the organizations that support its
            players, programs, and inclusive mission.
          </p>
        </div>
      </section>

      <section className="px-6 py-16 sm:py-24 lg:px-10">
        <div className="mx-auto max-w-7xl">
          {sponsors.length === 0 ? (
            <div className="border-y border-[#1E3653]/15 py-14 text-center">
              <h2 className="font-display text-2xl font-black uppercase">
                Partners coming soon
              </h2>
              <p className="mx-auto mt-3 max-w-xl font-body text-[#51667E]">
                The club has not published a partner list yet.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sponsors.map((sponsor) => (
                <article
                  key={sponsor.id}
                  className="group relative flex min-h-72 items-center justify-center overflow-hidden border border-[#1E3653]/10 bg-[#B9E3F6] p-10"
                >
                  <div className="absolute left-0 top-0 bg-[#FF1616] px-4 py-2 font-nav text-[0.65rem] font-bold uppercase tracking-[0.2em] text-white">
                    Proud partner
                  </div>
                  <ResilientImage
                    src={sponsor.logo_url}
                    alt={sponsor.name}
                    width={320}
                    height={220}
                    className="max-h-44 w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                    {...imageDeliveryProps("sponsor-logo")}
                  />
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
