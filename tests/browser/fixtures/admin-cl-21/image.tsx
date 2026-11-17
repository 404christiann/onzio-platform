/* eslint-disable @next/next/no-img-element -- DEV adapter for the real image component. */
import type { ImgHTMLAttributes } from "react";
export default function Image({fill,unoptimized:_u,priority:_p,quality:_q,placeholder:_h,blurDataURL:_b,onLoadingComplete:_c,alt="",...props}:ImgHTMLAttributes<HTMLImageElement>&{fill?:boolean;unoptimized?:boolean;priority?:boolean;quality?:number;placeholder?:string;blurDataURL?:string;onLoadingComplete?:unknown}){return <img {...props} alt={alt} style={fill?{...props.style,position:"absolute",inset:0,width:"100%",height:"100%"}:props.style}/>;}
