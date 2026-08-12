import type { CSSProperties, ReactNode } from "react";
import EditorialHeader from "@/components/editorial/EditorialHeader";
import EditorialFooter from "@/components/editorial/EditorialFooter";
import EditorialMotion from "@/components/editorial/EditorialMotion";
import { EditorialIdentityProvider } from "@/components/editorial/EditorialIdentityContext";
import type { ClubIdentityContent, ClubThemeColors } from "@/lib/club-identity";
import type { DBSiteSocialLink } from "@/lib/db-types";
import "@/styles/editorial.css";

/**
 * Root wrapper for the editorial site template.
 *
 * Sets `data-site-template="editorial"` (which scopes every editorial CSS
 * rule) and injects the club's colors as the `--club-primary` /
 * `--club-secondary` / `--club-accent` custom properties that the editorial
 * token system derives from — the same property names the approved mockup's
 * root layout injects on <body>. The Geist font scope arrives through
 * `fontClassName` from the tenant layout so the font never applies to
 * classic-template tenants.
 */
export default function EditorialShell({
  clubName,
  clubInitials,
  theme,
  crestUrl,
  crestOnDarkUrl,
  identity,
  socialLinks,
  fontClassName,
  children,
}: {
  clubName: string;
  clubInitials: string;
  theme: ClubThemeColors;
  crestUrl: string;
  crestOnDarkUrl: string;
  identity: ClubIdentityContent | null;
  socialLinks: DBSiteSocialLink[];
  fontClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-site-template="editorial"
      className={fontClassName}
      style={
        {
          "--club-primary": theme.primary,
          "--club-secondary": theme.secondary,
          "--club-accent": theme.accent,
        } as CSSProperties
      }
    >
      <EditorialHeader
        clubName={clubName}
        clubInitials={clubInitials}
        crestUrl={crestUrl}
      />
      <EditorialMotion />
      <EditorialIdentityProvider value={{ identity, crestUrl, crestOnDarkUrl }}>
        <main className="public-main">{children}</main>
      </EditorialIdentityProvider>
      <EditorialFooter
        clubName={clubName}
        crestOnDarkUrl={crestOnDarkUrl}
        identity={identity}
        socialLinks={socialLinks}
      />
    </div>
  );
}
