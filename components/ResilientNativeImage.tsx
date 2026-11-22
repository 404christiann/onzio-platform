"use client";

import {
  type ImgHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
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
  src,
  ...props
}: Props) {
  return (
    <ResilientNativeImageAttempt
      key={typeof src === "string" ? src : ""}
      src={src}
      {...props}
    />
  );
}

function ResilientNativeImageAttempt({
  alt = "",
  fallback,
  fallbackVariant = "photo",
  hideOnError = false,
  onError,
  src,
  ...props
}: Props) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // A server-rendered image can fail before React attaches onError; catch that
  // case on mount so it still falls back instead of showing a broken icon.
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0 && image.getAttribute("src")) setFailed(true);
  }, []);

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
      ref={imageRef}
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
