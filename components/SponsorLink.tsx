import type { ReactNode } from "react";

// ADMIN-RE-15 (decision 4 of group 3): a sponsor with "Their website" is a
// link to it, opened in a new tab; a sponsor without one is not tappable.
// Only http(s) addresses are linked (the database allows nothing else).
export default function SponsorLink({
  href,
  name,
  className,
  hidden = false,
  bareWithoutLink = false,
  children,
}: {
  href: string | null | undefined;
  name: string;
  className?: string;
  /** A repeated copy (the homepage strip's loop): kept out of the tab order. */
  hidden?: boolean;
  /** Without a website, render the logo as it was, with no wrapper. */
  bareWithoutLink?: boolean;
  children: ReactNode;
}) {
  const link = href && /^https?:\/\//i.test(href) ? href : null;
  if (!link) return bareWithoutLink ? <>{children}</> : <span className={className}>{children}</span>;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={className}
      aria-label={hidden ? undefined : `${name} (opens their website)`}
      tabIndex={hidden ? -1 : undefined}
    >
      {children}
    </a>
  );
}
