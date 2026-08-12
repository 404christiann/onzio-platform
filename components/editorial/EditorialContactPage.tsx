"use client";

import ResilientImage from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import type { ContactContent } from "@/lib/queries";

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
    <div className="interior contact-page">
      <header className="interior-hero">
        <span className="eyebrow">{page?.eyebrow || "Contact"}</span>
        <h1>{page?.headline || `Talk to ${club.name}`}</h1>
        {page?.intro ? <p className="contact-intro">{page.intro}</p> : null}
        {emailHref ? (
          <a className="contact-hero-cta" href={emailHref}>
            Email {club.name}
          </a>
        ) : null}
      </header>

      {details.length > 0 ? (
        <section className="contact-details">
          <span className="eyebrow">Get in touch</span>
          <div className="contact-details-grid">
            {details.map((detail) => (
              <div className="contact-detail-item" key={detail.label}>
                <span>{detail.label}</span>
                {detail.href ? (
                  <a href={detail.href}>{detail.value}</a>
                ) : (
                  <p>{detail.value}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {content.socialLinks.length > 0 ? (
        <section className="contact-social">
          <span className="eyebrow">Follow along</span>
          <div className="contact-social-links">
            {content.socialLinks.map((link) => (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                className="contact-social-icon"
              >
                <ResilientImage
                  src={link.icon}
                  alt=""
                  fill
                  sizes="32px"
                  {...imageDeliveryProps("small-graphic")}
                />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {!hasContent ? (
        <section className="contact-empty">
          <h2>Contact details coming soon</h2>
          <p>The club has not published contact information yet.</p>
        </section>
      ) : null}
    </div>
  );
}
