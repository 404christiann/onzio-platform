"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { PATHWAY_TRAINING_GATEWAY_CONFIG } from "@/components/pathway/training-gateway-config";
import { usePathwayTrainingGateway } from "@/components/pathway/PathwayTrainingGatewayProvider";

type PathwayTrainingTriggerProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "onClick"
> & {
  href?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function PathwayTrainingTrigger({
  href = PATHWAY_TRAINING_GATEWAY_CONFIG.pageHref,
  onClick,
  ...props
}: PathwayTrainingTriggerProps) {
  const { openTrainingGateway } = usePathwayTrainingGateway();

  return (
    <Link
      {...props}
      href={href}
      data-pathway-training-trigger="true"
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        openTrainingGateway(event.currentTarget);
      }}
    />
  );
}
