"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  House,
  ClipboardList,
  UsersRound,
  Ellipsis,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  Package,
  Timer,
  Truck,
  Layers,
  Shapes,
  Settings,
} from "lucide-react";
import { Brand } from "./brand";
import { logout } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/client";

export function AppShell({
  children,
  name,
  role,
  businessName,
  hasLogo,
}: {
  children: React.ReactNode;
  name: string;
  role: "admin" | "collaborator";
  businessName: string;
  hasLogo: boolean;
}) {
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) drawer.current?.showModal();
    else drawer.current?.close();
  }, [open]);
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    const client = createClient();
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login?notice=session");
    });
    // Revalidar estado activo al volver a la aplicación y durante sesiones abiertas.
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/auth/session", { cache: "no-store" });
        if (response.status === 401) router.replace("/login?notice=session");
      } catch {
        /* Sin conexión no se autoriza ninguna operación nueva. */
      }
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const interval = setInterval(check, 60_000);
    return () => {
      data.subscription.unsubscribe();
      clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router]);
  const nav = (
    <nav aria-label="Navegación principal" className="side-links">
      <span className="nav-caption">MI ESPACIO</span>
      <Link
        className={path === "/dashboard" ? "active" : ""}
        href="/dashboard"
        onClick={() => setOpen(false)}
      >
        <House size={20} />
        Inicio
      </Link>
      {[
        [ClipboardList, "Pedidos"],
        [Timer, "Tiempo"],
        [Truck, "Envíos"],
      ].map(([Icon, label]) => {
        const ItemIcon = Icon as typeof House;
        return (
          <span
            className="nav-disabled"
            aria-disabled="true"
            key={String(label)}
          >
            <ItemIcon size={20} />
            {String(label)}
            <small>Próximamente</small>
          </span>
        );
      })}
      {[
        [UsersRound, "Clientes", "/clientes"],
        [Package, "Productos", "/productos"],
        [Layers, "Materiales", "/materiales"],
        [Shapes, "Categorías", "/categorias"],
      ].map(([Icon, label, href]) => {
        const ItemIcon = Icon as typeof House;
        return (
          <Link
            key={String(href)}
            href={String(href)}
            className={path.startsWith(String(href)) ? "active" : ""}
            onClick={() => setOpen(false)}
          >
            <ItemIcon size={20} />
            {String(label)}
          </Link>
        );
      })}
      <Link
        className={path === "/mas" ? "active" : ""}
        href="/mas"
        onClick={() => setOpen(false)}
      >
        <Ellipsis size={20} />
        Más
      </Link>
      {role === "admin" && (
        <>
          <span className="nav-caption">ADMINISTRACIÓN</span>
          <Link
            href="/configuracion"
            className={path === "/configuracion" ? "active" : ""}
            onClick={() => setOpen(false)}
          >
            <Settings size={20} />
            Configuración
          </Link>
          <Link
            className={path === "/usuarios" ? "active" : ""}
            href="/usuarios"
            onClick={() => setOpen(false)}
          >
            <ShieldCheck size={20} />
            Usuarios
          </Link>
        </>
      )}
    </nav>
  );
  return (
    <div className="app-frame">
      <aside className="desktop-sidebar">
        <Brand />
        {nav}
        <div className="sidebar-note">
          <span className="handwritten">Puntada a puntada.</span>
          <p>Un espacio para cuidar lo que creas.</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button tablet-menu"
            aria-label="Abrir menú"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <div className="topbar-title">
            {hasLogo && (
              <Image
                unoptimized
                src="/api/catalog-image/logo"
                alt=""
                width={36}
                height={36}
              />
            )}
            {businessName}
            <span>Tu taller, en un solo lugar</span>
          </div>
          <div className="account">
            <span className="avatar" aria-hidden>
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="account-name">
              {name}
              <small>
                {role === "admin" ? "Administrador" : "Colaborador"}
              </small>
            </span>
            <form action={logout}>
              <button
                className="icon-button"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut size={20} />
              </button>
            </form>
          </div>
        </header>
        <main id="main-content" className="workspace-main">
          {children}
        </main>
        <footer className="workspace-footer">
          SIGCA <span>·</span> Hecho para acompañar tu creatividad
        </footer>
      </div>
      <dialog
        ref={drawer}
        onClose={() => setOpen(false)}
        className="tablet-drawer"
        aria-label="Menú"
      >
        <div className="drawer-heading">
          <Brand />
          <button
            className="icon-button"
            aria-label="Cerrar menú"
            autoFocus
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        {nav}
      </dialog>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        <Link
          aria-current={path === "/dashboard" ? "page" : undefined}
          href="/dashboard"
        >
          <House size={22} />
          Inicio
        </Link>
        <span aria-disabled="true" title="Disponible en una fase posterior">
          <ClipboardList size={22} />
          Pedidos
        </span>
        <Link
          href="/clientes"
          aria-current={path.startsWith("/clientes") ? "page" : undefined}
        >
          <UsersRound size={22} />
          Clientes
        </Link>
        <Link aria-current={path === "/mas" ? "page" : undefined} href="/mas">
          <Ellipsis size={22} />
          Más
        </Link>
      </nav>
    </div>
  );
}
