import ResilientImage from "@/components/ResilientImage";
import type { ContactContent } from "@/lib/queries";

function telephoneHref(phone: string): string {
  const normalized = phone.replace(/[^0-9+]/g, "");
  return /^\+?[0-9]{7,15}$/.test(normalized) ? `tel:${normalized}` : "";
}

// Mockup-parity contact page (DCFC-D132 pass): navy hero with the red
// "Email <club>" CTA, flat hairline detail columns instead of bordered
// cards, and social icons instead of red text links — structure/classes
// from the sales mockup's app/(public)/contact/page.tsx.
export default function AcademyContactPage({
  content,
  clubName = "the club",
}: {
  content: ContactContent;
  clubName?: string;
}) {
  const email = content.profile?.publicEmail?.trim() ?? "";
  const emailHref = email ? `mailto:${email}` : "";
  const phone = content.profile?.publicPhone?.trim() ?? "";
  const phoneHref = telephoneHref(phone);
  const page = content.page;

  const details: Array<{ label: string; value: string; href?: string }> = [
    ...(email ? [{ label: "Email", value: email, href: emailHref }] : []),
    ...(phone && phoneHref
      ? [{ label: "Phone", value: phone, href: phoneHref }]
      : []),
    ...(content.profile?.serviceArea
      ? [{ label: "Location", value: content.profile.serviceArea }]
      : []),
    ...(content.profile?.hours
      ? [{ label: "Hours", value: content.profile.hours }]
      : []),
  ];

  return (
    <div className="bg-[#F9FAFD]">
      <section className="relative isolate overflow-hidden bg-[#1E3653] px-6 pb-20 pt-40 text-white lg:px-10 lg:pb-28">
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
            <div className="absolute inset-0 -z-10 bg-[#14283F]/70" />
          </>
        ) : null}
        <div className="mx-auto max-w-7xl">
          <p className="font-display text-sm font-bold uppercase text-[#B9E3F6]">
            {page?.eyebrow || "Contact"}
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-[clamp(3.4rem,8vw,7rem)] font-black uppercase italic leading-[.9]">
            {page?.headline || "Start a conversation"}
          </h1>
          {page?.intro ? (
            <p className="mt-8 max-w-2xl font-body text-base leading-8 text-white/75 md:text-lg">
              {page.intro}
            </p>
          ) : null}
          {emailHref ? (
            <a
              href={emailHref}
              className="mt-8 inline-block bg-[#FF1616] px-7 py-4 font-display text-sm font-bold uppercase text-white transition-colors hover:bg-[#D70000]"
            >
              Email {clubName}
            </a>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        {details.length > 0 ? (
          <div className="grid gap-px overflow-hidden bg-[#1E3653]/15 md:grid-cols-3">
            {details.map((detail) => (
              <div key={detail.label} className="bg-[#F9FAFD] p-6 sm:p-8">
                <p className="font-display text-xs font-bold uppercase text-[#FF1616]">
                  {detail.label}
                </p>
                {detail.href ? (
                  <a
                    href={detail.href}
                    className="mt-3 block break-words font-display text-lg font-bold leading-snug text-[#1E3653] hover:text-[#FF1616] sm:text-xl"
                  >
                    {detail.value}
                  </a>
                ) : (
                  <p className="mt-3 font-display text-lg font-bold leading-snug text-[#1E3653] sm:text-xl">
                    {detail.value}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {content.socialLinks.length > 0 ? (
          <div className="mt-14">
            <p className="font-display text-xs font-bold uppercase text-[#1E3653]/45">
              Follow Along
            </p>
            <div className="mt-5 flex gap-5">
              {content.socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  className="relative h-8 w-8 opacity-70 transition-opacity hover:opacity-100"
                >
                  <ResilientImage
                    src={link.icon}
                    alt=""
                    fill
                    sizes="32px"
                    className="object-contain"
                  />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {!content.profile && !content.page ? (
          <div className="bg-[#EDF2F7] p-8 sm:p-12">
            <h2 className="font-display text-3xl font-black uppercase italic text-[#1E3653]">
              Contact details coming soon
            </h2>
            <p className="mt-3 font-body text-[#51667E]">
              The club has not published contact information yet.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
