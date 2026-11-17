"use client";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { LegacyRegistrationsEditor } from "@/components/admin/registrations/LegacyRegistrationsEditor";
import { ClassicRegistrationsEditor } from "@/components/admin/registrations/ClassicRegistrationsEditor";

export default function RegistrationsAdminPage() {
  const portal = useAdminPortal();
  return portal.portal === "reimagined" ? <LegacyRegistrationsEditor /> : <ClassicRegistrationsEditor />;
}
