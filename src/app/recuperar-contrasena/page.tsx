import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
import { publicSupabaseEnv } from "@/lib/supabase/env";
export const dynamic = "force-dynamic";
export default function Recover() {
  return (
    <AuthLayout
      title="Recupera tu acceso"
      description="Te enviaremos un enlace para establecer una nueva contraseña."
    >
      <div id="main-content">
        <AuthForm kind="recover" configured={!!publicSupabaseEnv()} />
        <Link className="text-link" href="/login">
          Volver al inicio de sesión
        </Link>
      </div>
    </AuthLayout>
  );
}
