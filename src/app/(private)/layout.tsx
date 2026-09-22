import { requireProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const { data: brand } = await (await createClient()).rpc("business_brand");
  return (
    <AppShell
      name={profile.full_name || "Mi cuenta"}
      role={profile.role}
      businessName={brand?.business_name ?? "caffi crochet"}
      hasLogo={Boolean(brand?.logo_path)}
    >
      {children}
    </AppShell>
  );
}
