import ResilientImage from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";

const affiliationLogos = [
  {
    src: "/images/logo/affiliations/us-soccer-color.png",
    alt: "US Soccer",
    className:
      "pathway-affiliation-mark pathway-affiliation-us-soccer",
  },
  {
    src: "/images/logo/affiliations/fifa-color.png",
    alt: "FIFA",
    className: "pathway-affiliation-mark pathway-affiliation-fifa",
  },
  {
    src: "/images/logo/affiliations/upsl-color.png",
    alt: "UPSL",
    className: "pathway-affiliation-mark pathway-affiliation-upsl",
  },
] as const;

/**
 * The standard US Soccer / FIFA / UPSL identity lockup shared by the
 * pathway@1 header. It deliberately reuses the same checked-in assets as the
 * clubhouse and editorial templates rather than introducing MLA-specific
 * image paths or a tenant branch.
 */
export default function PathwayAffiliationBar() {
  return (
    <div className="pathway-affiliation-lockup" aria-label="Club affiliations">
      <span className="pathway-affiliation-divider" aria-hidden="true" />
      <div>
        {affiliationLogos.map((logo) => (
          <span className={logo.className} key={logo.alt}>
            <ResilientImage
              src={logo.src}
              alt={logo.alt}
              width={64}
              height={64}
              {...imageDeliveryProps("small-graphic")}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
