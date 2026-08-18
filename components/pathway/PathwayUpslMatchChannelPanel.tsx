import ResilientImage from "@/components/ResilientImage";
import { PathwaySection } from "@/components/pathway/PathwaySection";
import { imageDeliveryProps } from "@/lib/image-delivery";

export type PathwayUpslChannelCrest = {
  src: string;
};

export type PathwayUpslChannelBannerMedia = {
  src: string;
  alt: string;
};

export type PathwayUpslChannelAction = {
  label: string;
  href: string;
};

export type PathwayUpslMatchChannelPanelProps = {
  kicker: string;
  headlineLead: string;
  headlineEmphasis: string;
  /** One entry per paragraph. */
  body: string[];
  bannerMedia?: PathwayUpslChannelBannerMedia;
  channelName: string;
  channelHandle: string;
  channelCrest?: PathwayUpslChannelCrest;
  subscribeAction: PathwayUpslChannelAction;
  watchAction: PathwayUpslChannelAction;
};

/**
 * Accessible YouTube identity card for pathway@1's UPSL page.
 *
 * Channel identity and destinations remain explicit props rather than
 * embedded club data. The selected pathway presentation supplies exactly two
 * YouTube actions, so the card never relies on ambiguous icon-only controls.
 */
export default function PathwayUpslMatchChannelPanel({
  kicker,
  headlineLead,
  headlineEmphasis,
  body,
  bannerMedia,
  channelName,
  channelHandle,
  channelCrest,
  subscribeAction,
  watchAction,
}: PathwayUpslMatchChannelPanelProps) {
  const youtubeActions = [
    { ...subscribeAction, variant: "primary" },
    { ...watchAction, variant: "secondary" },
  ] as const;
  const channelInitials = channelName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  const crestFallback = (
    <span
      className="pathway-upsl-channel-initials"
      aria-hidden="true"
    >
      {channelInitials}
    </span>
  );
  const bannerFallback = (
    <span
      className="pathway-upsl-channel-banner-fallback"
      aria-hidden="true"
    />
  );

  return (
    <PathwaySection className="pathway-upsl-channel-section">
      <div className="pathway-upsl-channel">
        <div className="pathway-upsl-channel-content">
          <div className="pathway-upsl-channel-copy">
            <p className="pathway-upsl-channel-kicker">{kicker}</p>
            <h2 className="pathway-upsl-channel-heading">
              <span className="pathway-upsl-channel-heading-lead">
                {headlineLead}
              </span>{" "}
              <span className="pathway-upsl-channel-heading-emphasis">
                {headlineEmphasis}
              </span>
            </h2>
            <div className="pathway-upsl-channel-body">
              {body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>

          <article
            className="pathway-upsl-channel-card"
            aria-label={`${channelName} official YouTube channel`}
          >
            <div
              className="pathway-upsl-channel-banner"
              data-has-photo={bannerMedia ? "true" : "false"}
            >
              {bannerMedia ? (
                <ResilientImage
                  className="pathway-upsl-channel-banner-image"
                  src={bannerMedia.src}
                  alt={bannerMedia.alt}
                  fill
                  sizes="(max-width: 760px) calc(100vw - 64px), 548px"
                  fallback={bannerFallback}
                  fallbackVariant="photo"
                  {...imageDeliveryProps("photograph")}
                />
              ) : (
                bannerFallback
              )}
              <span className="pathway-upsl-channel-platform">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <rect x="2.5" y="5.25" width="19" height="13.5" rx="4" />
                  <path
                    className="pathway-upsl-channel-platform-play"
                    d="m10 9 5 3-5 3Z"
                  />
                </svg>
                <span>YouTube</span>
              </span>
            </div>
            <div className="pathway-upsl-channel-identity">
              <div className="pathway-upsl-channel-mark">
                {channelCrest ? (
                  <ResilientImage
                    src={channelCrest.src}
                    alt=""
                    width={80}
                    height={80}
                    fallback={crestFallback}
                    fallbackVariant="logo"
                    {...imageDeliveryProps("club-logo")}
                  />
                ) : (
                  crestFallback
                )}
              </div>
              <div>
                <h3 className="pathway-upsl-channel-name">{channelName}</h3>
                <p className="pathway-upsl-channel-handle">{channelHandle}</p>
              </div>
            </div>

            <ul
              className="pathway-upsl-channel-actions"
              aria-label={`${channelName} YouTube actions`}
            >
              {youtubeActions.map((action) => (
                <li key={action.variant}>
                  <a
                    className="pathway-upsl-channel-link"
                    data-network="youtube"
                    data-variant={action.variant}
                    href={action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {action.label}
                  </a>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </PathwaySection>
  );
}
