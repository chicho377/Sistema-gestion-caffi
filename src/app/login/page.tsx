import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
import { publicSupabaseEnv } from "@/lib/supabase/env";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  return (
    <AuthLayout
      title="Qué gusto tenerte aquí"
      description="Ingresa a tu cuenta para continuar."
    >
      <div id="main-content">
        {notice === "session" && (
          <p className="message" role="status">
            Inicia sesión para continuar. Si tu acceso fue desactivado, consulta
            al Administrador.
          </p>
        )}
        {notice === "password-updated" && (
          <p className="message success" role="status">
            Contraseña actualizada. Ya puedes iniciar sesión.
          </p>
        )}
        <AuthForm kind="login" configured={!!publicSupabaseEnv()} />
        <Link className="text-link" href="/recuperar-contrasena">
          ¿Olvidaste tu contraseña?
        </Link>
        <p className="small muted">
          ¿Necesitas acceso? Solicita una invitación al Administrador.
        </p>
      </div>
    </AuthLayout>
  );
}
