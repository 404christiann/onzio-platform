import type { AnchorHTMLAttributes } from "react";
export function useRouter(){return {push:(href:string)=>{document.querySelector("output")!.textContent=href;},replace:()=>{},refresh:()=>{},prefetch:()=>Promise.resolve()};}
export function usePathname(){return "/admin/homepage";}
export function useSearchParams(){return new URLSearchParams(location.search);}
export default function Link(props:AnchorHTMLAttributes<HTMLAnchorElement>){return <a {...props}/>;}
