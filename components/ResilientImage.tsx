"use client";

import Image, { type ImageProps } from "next/image";
import { type ReactNode, useState } from "react";
import {
  nextImageDeliveryAttempt,
  type ResilientImageAttempt,
} from "@/lib/image-delivery";

type Props = Omit<ImageProps, "onError" | "unoptimized"> & {
  fallback: ReactNode;
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
  src,
  alt,
  ...imageProps
}: Props) {
  const [attempt, setAttempt] =
    useState<ResilientImageAttempt>("optimized");

  if (attempt === "failed") {
    return <>{fallback}</>;
  }

  return (
    <Image
      {...imageProps}
      key={attempt}
      src={src}
      alt={alt}
      unoptimized={attempt === "raw"}
      data-image-delivery-attempt={attempt}
      onError={() => setAttempt(nextImageDeliveryAttempt(attempt))}
    />
  );
}
