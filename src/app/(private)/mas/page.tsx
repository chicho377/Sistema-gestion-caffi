import Link from "next/link";
import {
  ShieldCheck,
  LogOut,
  Package,
  Layers,
  Shapes,
  Settings,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { logout } from "@/features/auth/actions";
export default async function More() {
  const profile = await requireProfile();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TU CUENTA</span>
          <h1>Más opciones</h1>
          <p className="muted">
            Administra tu acceso desde cualquier dispositivo.
          </p>
        </div>
      </div>
      <section className="panel form-stack">
        <h2>{profile.full_name}</h2>
        <p className="break-word">{profile.email}</p>
        <span className="status-pill">
          {profile.role === "admin" ? "Administrador" : "Colaborador"}
        </span>
        <Link className="button secondary" href="/productos">
          <Package size={20} />
          Productos
        </Link>
        <Link className="button secondary" href="/materiales">
          <Layers size={20} />
          Materiales
        </Link>
        <Link className="button secondary" href="/categorias">
          <Shapes size={20} />
          Categorías
        </Link>
        {profile.role === "admin" && (
          <Link className="button secondary" href="/configuracion">
            <Settings size={20} />
            Configuración
          </Link>
        )}
        {profile.role === "admin" && (
          <Link className="button secondary" href="/usuarios">
            <ShieldCheck size={20} />
            Administrar usuarios
          </Link>
        )}
        <form action={logout}>
          <button className="button secondary">
            <LogOut size={20} />
            Cerrar sesión
          </button>
        </form>
      </section>
    </>
  );
}
