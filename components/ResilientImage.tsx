"use client";

import Image, { type ImageProps } from "next/image";
import { type ReactNode, useState } from "react";
import {
  nextImageDeliveryAttempt,
  type ResilientImageAttempt,
} from "@/lib/image-delivery";
import ImageFallback, {
  type ImageFallbackVariant,
} from "@/components/ImageFallback";

type Props = Omit<ImageProps, "onError"> & {
  fallback?: ReactNode;
  fallbackVariant?: ImageFallbackVariant;
  onError?: ImageProps["onError"];
};

export default function ResilientImage({
  src,
  alt,
  ...props
}: Props) {
  const sourceKey =
    typeof src === "string"
      ? src
      : "default" in src
        ? src.default.src
        : src.src;

  return (
    <ResilientImageAttempt
      key={sourceKey}
      src={src}
      alt={alt}
      {...props}
    />
  );
}

function ResilientImageAttempt({
  fallback,
  fallbackVariant = "photo",
  src,
  alt,
  onError,
  ...imageProps
}: Props) {
  const [attempt, setAttempt] =
    useState<ResilientImageAttempt>("raw");

  if (attempt === "failed") {
    if (fallback !== undefined) return <>{fallback}</>;
    if (!alt) return null;
    return (
      <ImageFallback
        label={`${alt} unavailable`}
        variant={fallbackVariant}
        fill={imageProps.fill === true}
        width={typeof imageProps.width === "number" ? imageProps.width : undefined}
        height={typeof imageProps.height === "number" ? imageProps.height : undefined}
      />
    );
  }

  return (
    <Image
      {...imageProps}
      src={src}
      alt={alt}
      unoptimized
      data-critical-image={alt ? "true" : undefined}
      data-image-delivery-attempt={attempt}
      onError={(event) => {
        const failedSource = event.currentTarget.src;
        onError?.(event);
        if (event.currentTarget.src !== failedSource) return;
        setAttempt(nextImageDeliveryAttempt(attempt));
      }}
    />
  );
}
