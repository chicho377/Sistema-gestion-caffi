import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  const valid =
    !!params.token_hash && ["invite", "recovery"].includes(params.type || "");
  return (
    <AuthLayout
      title="Confirma tu acceso"
      description="Continúa para validar tu enlace y establecer tu contraseña."
    >
      <div id="main-content">
        {valid ? (
          <AuthForm
            kind="confirm"
            tokenHash={params.token_hash}
            tokenType={params.type}
          />
        ) : (
          <p className="message error" role="alert">
            El enlace no es válido. Solicita una nueva invitación o recupera tu
            contraseña.
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
