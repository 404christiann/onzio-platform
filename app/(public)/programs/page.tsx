import AcademyProgramsPage from "@/components/AcademyProgramsPage";

// Tenant requests are rewritten to /_clubs/[slug]/programs by middleware.
// This canonical file keeps the route in the Next.js manifest and provides a
// safe empty state if it is rendered outside verified tenant routing.
export default function ProgramsPage() {
  return <AcademyProgramsPage programs={[]} />;
}
