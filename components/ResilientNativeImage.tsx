"use client";

import {
  type ImgHTMLAttributes,
  type ReactNode,
  useState,
} from "react";
import ImageFallback, {
  type ImageFallbackVariant,
} from "@/components/ImageFallback";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  fallback?: ReactNode;
  fallbackVariant?: ImageFallbackVariant;
  hideOnError?: boolean;
};

export default function ResilientNativeImage({
  alt = "",
  fallback,
  fallbackVariant = "photo",
  hideOnError = false,
  onError,
  src,
  ...props
}: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (hideOnError || !alt) return null;
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <ImageFallback
        label={`${alt} unavailable`}
        variant={fallbackVariant}
      />
    );
  }

  return (
    // Native rendering is intentional for data/blob URLs and keeps these
    // sources independent from runtime optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={src}
      alt={alt}
      data-critical-image={alt ? "true" : undefined}
      data-image-delivery-attempt="raw"
      onError={(event) => {
        onError?.(event);
        setFailed(true);
      }}
    />
  );
}
