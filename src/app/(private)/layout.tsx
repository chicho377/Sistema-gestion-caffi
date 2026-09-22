import { requireProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  return (
    <AppShell name={profile.full_name || "Mi cuenta"} role={profile.role}>
      {children}
    </AppShell>
  );
}
