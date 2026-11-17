"use client";

import { AdminImageField } from "@/components/admin/ui/AdminImageField";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_INPUT_CLASS, ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";
import Footer from "@/components/Footer";
import ScaledPagePreview from "@/components/admin/ScaledPagePreview";
import { GRAPHIC_UPLOAD_TYPES_LABEL } from "@/lib/media-upload-types";
import { DEFAULT_SITE_SOCIAL_LINKS } from "@/lib/social-links";
import styles from "./ClubSettings.module.css";

function Field({ tall = false }: { tall?: boolean }) {
  return <div className={styles.field}><Shimmer style={{ width: 110, height: 16 }} /><Shimmer style={{ height: tall ? 84 : 40 }} /></div>;
}

export function BrandingSkeleton({ tagline }: { tagline: boolean }) {
  return <div className={styles.panels} aria-hidden="true" inert>
    <section className={styles.card}>
      <h2><Shimmer>Club logo</Shimmer></h2>
      <p className={styles.description}><Shimmer>Your logo appears across the website and the admin portal.</Shimmer></p>
      <div className={styles.logoGrid}>
        <div>
          <div className={styles.previews}>{[0, 1].map((key) => <Shimmer key={key} className={styles.logoBox} />)}</div>
          <ul className={styles.where}>{["Website navigation", "Website footer", "Next match card", "Admin login and menu", "Players without a photo", "Browser tab icon"].map((place) => <li key={place}><Shimmer>{place}</Shimmer></li>)}</ul>
        </div>
        <div className={styles.upload}>
          <Shimmer><div style={{ visibility: "hidden" }}><AdminImageField label="Club logo" initials="?" shape="square" size={64} allowedTypes={["image/png", "image/webp"]} maxBytes={5 * 1024 * 1024} disabled onUpload={async () => false} /></div></Shimmer>
          <p className={styles.hint}><Shimmer>{GRAPHIC_UPLOAD_TYPES_LABEL}, up to 5 MB. Use a transparent background. Drop an image on the preview or choose a file.</Shimmer></p>
        </div>
      </div>
    </section>
    <section className={styles.card}>
      <h2><Shimmer>{tagline ? "Footer and social links" : "Social links"}</Shimmer></h2>
      <p className={styles.description}><Shimmer>The links behind the social icons in the public website footer.{tagline && " Edit the tagline beside the crest too."}</Shimmer></p>
      {tagline && <div className={styles.field}>
        <span className={ADMIN_LABEL_CLASS}><Shimmer>Footer tagline</Shimmer></span>
        <Shimmer><Textarea className="block" rows={3} disabled aria-hidden style={{ visibility: "hidden" }} /></Shimmer>
        <span className={styles.counter}><Shimmer>0/160</Shimmer></span>
        <p className={styles.hint}><Shimmer>Shown under the club name in the footer. Press Enter for a second line. Leave empty to restore the standard wording.</Shimmer></p>
      </div>}
      <div className={styles.links}>{DEFAULT_SITE_SOCIAL_LINKS.map((link) => <div key={link.id} className={styles.field}>
        <span className={ADMIN_LABEL_CLASS}><Shimmer>{link.label}</Shimmer></span>
        <Shimmer className={ADMIN_INPUT_CLASS}>https://</Shimmer>
      </div>)}</div>
      <p className={styles.hint}><Shimmer>Leave a link empty to hide its icon.</Shimmer></p>
      <span className={styles.previewLabel}><Shimmer>Footer preview</Shimmer></span>
      <div className={styles.preview}><Shimmer><div style={{ visibility: "hidden" }}><ScaledPagePreview><Footer /></ScaledPagePreview></div></Shimmer></div>
    </section>
  </div>;
}

export function TeamSkeleton() {
  return <div className={styles.panels} aria-hidden="true">
    <div className={styles.addRow}><Field /><Shimmer style={{ width: "100%", minWidth: 176, height: 40 }} /></div>
    <Shimmer style={{ width: "85%", height: 16 }} />
    <Shimmer style={{ width: 190, height: 20 }} />
    {[0, 1, 2].map((key) => <Shimmer key={key} style={{ height: 68 }} />)}
  </div>;
}
