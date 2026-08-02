import { notFound } from "next/navigation";

// Program details require a server-resolved tenant. Middleware rewrites valid
// requests to the tenant runtime route; an unscoped canonical request fails
// closed rather than guessing a club.
export default function ProgramDetailPage() {
  notFound();
}
