import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function StaffPage() {
  redirect("/roster#staff");
}
