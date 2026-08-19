import JoinInterestForm from "@/components/JoinInterestForm";

// Tenant requests are rewritten to /_clubs/[slug]/join/interest by
// middleware (see the "/join/interest" entry in PUBLIC_TENANT_PATHS). This
// canonical file keeps the route in the Next.js manifest and, mirroring
// app/(public)/roster/[playerId]/page.tsx, renders the real form component
// directly rather than a stub: JoinInterestForm never calls
// useClubContext() and sends no club identifier of its own, so it is safe
// to mount outside verified tenant routing -- the submission it posts is
// re-validated and tenant-scoped entirely server-side by
// /api/registrations/interest from the request's own verified headers.
export default function JoinInterestPage() {
  return <JoinInterestForm />;
}
