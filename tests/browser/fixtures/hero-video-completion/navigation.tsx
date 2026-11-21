import type { AnchorHTMLAttributes, ReactNode } from "react";

export function useRouter() {
  return { push: () => undefined, replace: () => undefined, refresh: () => undefined, prefetch: () => Promise.resolve() };
}
export function usePathname() { return "/admin/homepage"; }
export function useSearchParams() { return new URLSearchParams(); }
export function useParams() { return {}; }
export default function Link({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
  return <a {...props}>{children}</a>;
}
