"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone" id="main-content">
      <div className="panel">
        <h1>No pudimos cargar esta página</h1>
        <p>
          Intenta nuevamente. Si el problema continúa, consulta al
          Administrador.
        </p>
        <button className="button primary" onClick={reset}>
          Intentar de nuevo
        </button>
        <Link className="text-link" href="/login">
          Volver al inicio de sesión
        </Link>
      </div>
    </main>
  );
}
