import type { ImgHTMLAttributes } from "react";
export default function FixtureImage({ fill, unoptimized: _unoptimized, priority: _priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean; priority?: boolean }) {
  return <img {...props} style={fill ? { ...props.style, position: "absolute", inset: 0, width: "100%", height: "100%" } : props.style} />;
}
