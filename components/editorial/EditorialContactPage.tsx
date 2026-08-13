"use client";

import { useClubContext } from "@/components/ClubContextProvider";
import type { ContactContent } from "@/lib/queries";
import type { DBSiteSocialLink } from "@/lib/db-types";

/**
 * Presentational editorial contact page (`/contact`).
 *
 * There is no reference implementation of a Contact page on the superseded
 * claude/lions-fc-website-setup-ij0p7t branch, so this is built from
 * scratch: structurally modeled on the already-shipped
 * components/AcademyContactPage.tsx (same `ContactContent` shape from
 * `fetchContactContent`, same empty-state logic when both `profile` and
 * `page` are null), restyled with editorial's own interior-hero + detail
 * grid pattern instead of DCFC's navy hero and bordered-card mockup styling.
 *
 * Read-only: no <form>, no mutation.
 */

function telephoneHref(phone: string): string {
  const normalized = phone.replace(/[^0-9+]/g, "");
  return /^\+?[0-9]{7,15}$/.test(normalized) ? `tel:${normalized}` : "";
}

function SocialIcon({ platform }: { platform: DBSiteSocialLink["id"] }) {
  if (platform === "instagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.25" />
        <circle className="social-icon-fill" cx="17.4" cy="6.7" r="1.15" />
      </svg>
    );
  }
  if (platform === "youtube") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="2.5" y="5.25" width="19" height="13.5" rx="4" />
        <path className="social-icon-fill" d="m10 9 5 3-5 3Z" />
      </svg>
    );
  }
  if (platform === "facebook") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path className="social-icon-fill" d="M14 8h3V4.3A15 15 0 0 0 14.4 4C11.8 4 10 5.6 10 8.6V11H7v4h3v7h4v-7h3.2l.8-4H14V8.8c0-.6.4-.8 1-.8Z" />
      </svg>
    );
  }
  if (platform === "x") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 4l14 16M19 4 5 20" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14 4v10.2a4.2 4.2 0 1 1-3.4-4.1" />
      <path d="M14 4c.7 2.2 2.1 3.7 4.5 4.2" />
    </svg>
  );
}

export default function EditorialContactPage({
  content,
}: {
  content: ContactContent;
}) {
  const club = useClubContext();
  const email = content.profile?.publicEmail?.trim() ?? "";
  const emailHref = email ? `mailto:${email}` : "";
  const phone = content.profile?.publicPhone?.trim() ?? "";
  const phoneHref = telephoneHref(phone);
  const page = content.page;
  const hasContent = Boolean(content.profile || page);

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
    <div className="interior contact-page bg-ed-paper px-5 pb-28 pt-32 text-ed-ink md:px-8">
      <div className="mx-auto grid max-w-[1180px] gap-14">
      <header className="interior-hero grid gap-6 border-b border-[color:var(--ed-line)] pb-10">
        <span className="eyebrow">{page?.eyebrow || "Contact"}</span>
        <h1 className="max-w-[12ch] text-[clamp(3.75rem,11vw,9rem)] font-black uppercase leading-[0.82]">{page?.headline || `Talk to ${club.name}`}</h1>
        {page?.intro ? <p className="contact-intro max-w-2xl text-xl leading-9 text-ed-muted">{page.intro}</p> : null}
        {emailHref ? (
          <a className="contact-hero-cta justify-self-start border border-ed-accent bg-ed-accent px-5 py-3 font-display text-xs font-black uppercase tracking-[0.14em] text-ed-on-accent" href={emailHref}>
            Email {club.name}
          </a>
        ) : null}
      </header>

      {details.length > 0 ? (
        <section className="contact-details grid gap-8">
          <span className="eyebrow">Get in touch</span>
          <div className="contact-details-grid grid gap-4 md:grid-cols-2">
            {details.map((detail) => (
              <div className="contact-detail-item grid gap-3 border border-[color:var(--ed-line)] bg-ed-panel-glass p-6" key={detail.label}>
                <span className="font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent">{detail.label}</span>
                {detail.href ? (
                  <a className="font-display text-3xl font-black uppercase leading-none" href={detail.href}>{detail.value}</a>
                ) : (
                  <p className="font-display text-3xl font-black uppercase leading-none">{detail.value}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {content.socialLinks.length > 0 ? (
        <section className="contact-social grid gap-8">
          <span className="eyebrow">Follow along</span>
          <div className="contact-social-links flex flex-wrap gap-3">
            {content.socialLinks.map((link) => (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                title={link.label}
                className="contact-social-icon grid size-14 place-items-center border border-[color:var(--ed-line)] text-ed-ink transition hover:border-ed-accent hover:text-ed-accent [&_svg]:size-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2 [&_.social-icon-fill]:fill-current [&_.social-icon-fill]:stroke-0"
              >
                <SocialIcon platform={link.id} />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {!hasContent ? (
        <section className="contact-empty grid gap-3 border border-[color:var(--ed-line)] bg-ed-panel-glass p-6">
          <h2 className="font-display text-4xl font-black uppercase leading-none">Contact details coming soon</h2>
          <p className="text-ed-muted">The club has not published contact information yet.</p>
        </section>
      ) : null}
      </div>
    </div>
  );
}
