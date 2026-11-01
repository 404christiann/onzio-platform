import type { ProgramContent } from "@/lib/queries";
import { academyHref, type AcademyHref } from "./routes";

export type NavLink = { label: string; href: AcademyHref };
/** A trigger without a page of its own: it only reveals its children. */
export type NavMenu = { label: string; children: readonly NavLink[] };
export type NavItem = NavLink | NavMenu;

export function academyNavItems(
  programs: readonly Pick<ProgramContent, "slug" | "navLabel" | "displayTitle">[],
): readonly NavItem[] {
  return [
    { label: "Home", href: academyHref("home") },
    { label: "About", href: academyHref("about") },
    { label: "Roster", href: academyHref("roster") },
    {
      label: "Schedule",
      children: [
        { label: "Fixtures", href: academyHref("schedule") },
        { label: "Tryouts", href: academyHref("tryouts") },
      ],
    },
    {
      label: "Programs",
      children: programs.map((program) => ({
        label: program.navLabel || program.displayTitle,
        href: academyHref("programDetail", { programSlug: program.slug }),
      })),
    },
    { label: "Store", href: academyHref("shop") },
    { label: "Contact", href: academyHref("contact") },
  ];
}

export const academyFooterLinks: readonly NavLink[] = [
  { label: "Club", href: academyHref("about") },
  { label: "Programs", href: academyHref("programs") },
  { label: "Roster", href: academyHref("roster") },
  { label: "Schedule", href: academyHref("schedule") },
  { label: "Sponsors", href: academyHref("sponsors") },
  { label: "Contact", href: academyHref("contact") },
  { label: "Tryouts", href: academyHref("tryouts") },
];

export function isLinkActive(pathname: string, href: AcademyHref): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if ("href" in item) return isLinkActive(pathname, item.href);
  return item.children.some((child) => pathname === child.href);
}
