import JoinPage from "@/components/JoinPage";

// Tenant requests are rewritten to /_clubs/[slug]/join by middleware.
// This canonical file keeps the route in the Next.js manifest and provides a
// safe empty state if it is rendered outside verified tenant routing.
export default function Join() {
  return <JoinPage />;
}
