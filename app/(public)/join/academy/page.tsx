import RegistrationOpeningSoon from "@/components/RegistrationOpeningSoon";

// Tenant requests are rewritten to /_clubs/[slug]/join/academy by
// middleware. This canonical file keeps the route in the Next.js manifest
// and provides a safe, non-revealing empty state if it is ever rendered
// outside verified tenant routing (mirrors app/(public)/join/page.tsx).
export default function JoinAcademy() {
  return <RegistrationOpeningSoon clubName="this club" />;
}
