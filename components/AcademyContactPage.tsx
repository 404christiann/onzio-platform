import ResilientImage from "@/components/ResilientImage";
import type { ContactContent } from "@/lib/queries";

function telephoneHref(phone: string): string {
  const normalized = phone.replace(/[^0-9+]/g, "");
  return /^\+?[0-9]{7,15}$/.test(normalized) ? `tel:${normalized}` : "";
}

export default function AcademyContactPage({
  content,
}: {
  content: ContactContent;
}) {
  const emailHref = content.profile?.publicEmail
    ? `mailto:${content.profile.publicEmail}`
    : "";
  const phoneHref = telephoneHref(content.profile?.publicPhone ?? "");
  const page = content.page;

  return (
    <div className="min-h-screen bg-white pt-24 text-[#141414] sm:pt-28">
      <section className="relative isolate overflow-hidden bg-[#141414] px-6 py-20 text-white sm:py-28 lg:px-10">
        {page?.heroMediaUrl ? (
          <>
            <ResilientImage
              src={page.heroMediaUrl}
              alt=""
              fill
              priority
              className="-z-20 object-cover"
              sizes="100vw"
            />
            <div className="absolute inset-0 -z-10 bg-black/70" />
          </>
        ) : null}
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-red)]">
            {page?.eyebrow || "Contact"}
          </p>
          <h1 className="mt-5 max-w-4xl text-5xl font-black sm:text-7xl">
            {page?.headline || "Start a conversation"}
          </h1>
          {page?.intro ? (
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">
              {page.intro}
            </p>
          ) : null}
        </div>
      </section>

      <section className="px-6 py-16 sm:py-24 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2 xl:grid-cols-3">
          {emailHref ? (
            <a href={emailHref} className="rounded-2xl border border-black/10 p-7 transition hover:border-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-red)]">Email</p>
              <p className="mt-3 break-words text-xl font-bold">{content.profile?.publicEmail}</p>
            </a>
          ) : null}
          {phoneHref ? (
            <a href={phoneHref} className="rounded-2xl border border-black/10 p-7 transition hover:border-black/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-red)]">Phone</p>
              <p className="mt-3 text-xl font-bold">{content.profile?.publicPhone}</p>
            </a>
          ) : null}
          {content.profile?.serviceArea ? (
            <div className="rounded-2xl border border-black/10 p-7 sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-red)]">Location</p>
              <p className="mt-3 text-xl font-bold">{content.profile.serviceArea}</p>
            </div>
          ) : null}
          {content.profile?.hours ? (
            <div className="rounded-2xl border border-black/10 p-7 sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-red)]">Hours</p>
              <p className="mt-3 text-xl font-bold">{content.profile.hours}</p>
            </div>
          ) : null}
        </div>

        {content.socialLinks.length > 0 ? (
          <div className="mx-auto mt-12 max-w-7xl border-t border-black/10 pt-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/45">Follow the club</p>
            <div className="mt-4 flex flex-wrap gap-5">
              {content.socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display text-sm font-black uppercase tracking-[0.14em] text-[var(--color-red)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {!content.profile && !content.page ? (
          <div className="mx-auto max-w-7xl rounded-2xl bg-[#f5f5f5] p-8 sm:p-12">
            <h2 className="text-3xl font-black">Contact details coming soon</h2>
            <p className="mt-3 text-black/60">The club has not published contact information yet.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
