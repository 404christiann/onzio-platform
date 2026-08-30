/**
 * Bunny.net Stream video delivery constants.
 *
 * Real video, uploaded and transcoded via Bunny Stream library `723074`
 * ("onzio"), per `DCFC-D105` (approved capability) and the decision that
 * superseded `DCFC-D114`'s interim crest-only hero — see
 * `docs/phase-11/diverse-city/DECISIONS.md` and `STATUS.md` for the full
 * record, including verification that both GUIDs below finished transcoding
 * (status 4/"Finished") before being wired up here.
 *
 * These GUIDs and the CDN pull-zone hostname are non-secret identifiers,
 * the same class this repository already records elsewhere (Stripe Price
 * IDs, deployment IDs, etc.). The Bunny account/library API keys used to
 * create and upload these videos are never stored in this repository.
 *
 * Both videos currently in this library are specific to Diverse City FC
 * (`academy@1`). If a future `academy@1` club needs its own hero/story
 * video, these constants should become per-club data rather than being
 * reused as-is.
 */

const BUNNY_STREAM_PULL_ZONE_HOST = "vz-dab9684b-901.b-cdn.net";

export type BunnyVideoAsset = {
  /** Bunny Stream video GUID within library 723074. */
  guid: string;
  /** Local static poster image shown while the video loads and used as the
   *  graceful-degradation fallback if Bunny playback fails. */
  posterSrc: string;
  width: number;
  height: number;
};

export type BunnyMp4Resolution = "240p" | "360p" | "480p" | "720p";

/**
 * Bunny Stream's MP4-fallback delivery URL for a given video/resolution.
 * Used as the direct native-`<video>` source instead of HLS so this
 * codebase doesn't need to add an `hls.js` dependency: Bunny generates a
 * progressive-download MP4 per resolution automatically once "MP4
 * Fallback" is enabled on the library (confirmed enabled on library
 * 723074), which every modern browser can play natively.
 */
export function bunnyVideoMp4Url(
  guid: string,
  resolution: BunnyMp4Resolution = "720p",
): string {
  return `https://${BUNNY_STREAM_PULL_ZONE_HOST}/${guid}/play_${resolution}.mp4`;
}

/** Diverse City FC homepage hero — full-bleed background clip. */
export const DIVERSE_CITY_HERO_VIDEO: BunnyVideoAsset = {
  guid: "e49b4657-7396-48d7-b55b-09d38d892c72",
  posterSrc: "/images/video/diverse-city-hero-poster.jpg",
  width: 1280,
  height: 720,
};

/** Diverse City FC "Developing the Next Generation" story-section clip. */
export const DIVERSE_CITY_STORY_VIDEO: BunnyVideoAsset = {
  guid: "f84f9cbb-4b03-43f8-94f3-33010680533e",
  posterSrc: "/images/video/diverse-city-club-reel-poster.jpg",
  width: 720,
  height: 1280,
};
