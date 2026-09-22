import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone" id="main-content">
      <div className="panel">
        <h1>Esta página no está disponible</h1>
        <p>Vuelve a tu espacio para continuar.</p>
        <Link className="button primary" href="/dashboard">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
