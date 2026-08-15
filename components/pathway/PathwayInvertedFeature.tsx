import PathwaySplitFeature, {
  type PathwaySplitFeatureProps,
} from "@/components/pathway/PathwaySplitFeature";

/**
 * pathway.inverted-feature — the dark-ground variant of
 * pathway.split-feature (MLA P1 Step 5). Used on the UPSL page, where the
 * band needs to break the paper-white rhythm of the rest of the site.
 *
 * It is registered as its own section type because a document author picks
 * it by type, but it is *not* a second layout: the grid, the bottom
 * alignment, the stacking behaviour and the media placeholder are all
 * PathwaySplitFeature's, and this file only pins tone="dark". Duplicating
 * the layout would guarantee the two drift apart the first time the split
 * grid is adjusted.
 */

export type PathwayInvertedFeatureProps = Omit<PathwaySplitFeatureProps, "tone">;

export default function PathwayInvertedFeature(props: PathwayInvertedFeatureProps) {
  return <PathwaySplitFeature {...props} tone="dark" />;
}
