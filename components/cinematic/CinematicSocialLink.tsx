"use client";

import { useId } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import type { DBSiteSocialLink, SiteSocialPlatform } from "@/lib/db-types";
import { cinematicSocialPlatform } from "./social-platform";
import { SOCIAL_ICON_PATHS } from "./social-icon-paths";

function SocialIcon({ platform }: { platform: SiteSocialPlatform }) {
  const gradientId = useId().replaceAll(":", "");
  if (platform === "x") return <span className="x-social" aria-hidden="true">𝕏</span>;
  const paths = SOCIAL_ICON_PATHS[platform];
  const color = platform === "facebook" ? "#1877F2" : platform === "youtube" ? "#FF0000" : platform === "instagram" ? `url(#${gradientId})` : "#000000";
  const note = platform === "tiktok" ? paths[0].slice(paths[0].indexOf("M16.9723")) : "";
  return <svg viewBox="0 0 24 24" fill={color} aria-hidden="true" focusable="false">
    {platform === "instagram" && <defs><linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#FFDC80" /><stop offset=".3" stopColor="#F77737" /><stop offset=".6" stopColor="#E1306C" /><stop offset="1" stopColor="#833AB4" /></linearGradient></defs>}
    <g transform={platform === "youtube" ? "translate(2 2)" : undefined}>{platform === "youtube" && <polygon points="8.811 11.495 11.927 9.88 8.807 8.255" />}{paths.map((d, index) => <path key={index} d={d} fillRule="evenodd" />)}</g>
    {note && <>{([ ["#25F4EE", "-.35 -.25"], ["#FE2C55", ".35 .25"], ["#FFFFFF", "0 0"] ] as const).map(([fill, offset]) => <path key={fill} d={note} fill={fill} transform={`translate(${offset})`} />)}</>}
  </svg>;
}


export default function CinematicSocialLink({ social }: { social: DBSiteSocialLink }) {
  const platform = cinematicSocialPlatform(social);
  return <a href={social.href} aria-label={social.label} target="_blank" rel="noopener noreferrer">{platform ? <SocialIcon platform={platform} /> : <NativeImage src={social.icon} alt="" />}</a>;
}
