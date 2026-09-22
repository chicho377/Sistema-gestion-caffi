import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
import { getActiveProfile } from "@/lib/auth";
import { canChangePassword } from "@/lib/password-flow";
export const dynamic = "force-dynamic";
export default async function NewPassword() {
  const profile = await getActiveProfile();
  const allowed = profile && (await canChangePassword(profile.id));
  return (
    <AuthLayout
      title="Tu nueva contraseña"
      description="Elige una contraseña segura y confirma que coincida."
    >
      <div id="main-content">
        {allowed ? (
          <AuthForm kind="password" />
        ) : (
          <p className="message error" role="alert">
            Necesitas un enlace válido para establecer tu contraseña.
          </p>
        )}
        <Link className="text-link" href="/recuperar-contrasena">
          Solicitar un nuevo enlace
        </Link>
        <Link className="text-link" href="/login">
          Volver al inicio de sesión
        </Link>
      </div>
    </AuthLayout>
  );
}
