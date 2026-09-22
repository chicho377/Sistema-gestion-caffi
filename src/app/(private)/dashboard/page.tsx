import Link from "next/link";
import {
  Flower2,
  ClipboardList,
  UsersRound,
  Package,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const profile = await requireProfile();
  const { notice } = await searchParams;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TU ESPACIO CREATIVO</span>
          <h1>Bienvenida a tu taller</h1>
          <p className="muted">
            Todo empieza con una idea y una primera puntada.
          </p>
        </div>
        <span className="status-pill">
          <ShieldCheck size={16} />
          Acceso seguro
        </span>
      </div>
      {notice === "forbidden" && (
        <p role="alert" className="message error">
          Tu rol no permite acceder a esa sección.
        </p>
      )}
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">UN LUGAR PARA TUS CREACIONES</span>
          <h2>
            Más espacio para
            <br />
            lo que te gusta hacer.
          </h2>
          <p>
            Tu cuenta está lista. Aquí podrás acompañar cada creación, desde la
            primera idea hasta su entrega.
          </p>
          <span className="handwritten">Vamos, puntada a puntada.</span>
        </div>
        <div className="welcome-flower" aria-hidden>
          <Flower2 strokeWidth={1} />
        </div>
      </section>
      <div className="section-heading">
        <h2>Así crecerá tu espacio</h2>
        <span className="small muted">Próximamente</span>
      </div>
      <div className="module-grid">
        {[
          {
            icon: ClipboardList,
            title: "Tus pedidos",
            text: "Cada encargo, sus detalles y su historia.",
          },
          {
            icon: UsersRound,
            title: "Tus clientes",
            text: "Las personas que eligen lo que creas.",
          },
          {
            icon: Package,
            title: "Tus productos",
            text: "Un lugar para organizar tus creaciones.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <article className="module-card" key={title}>
            <span className="module-icon">
              <Icon size={24} />
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
            <span className="small muted">Aún no disponible</span>
          </article>
        ))}
      </div>
      <section className="account-panel">
        <ShieldCheck size={26} />
        <div>
          <h3>Tu espacio es privado</h3>
          <p>Solo las personas autorizadas pueden acceder.</p>
        </div>
        {profile.role === "admin" && (
          <Link className="button secondary" href="/usuarios">
            Administrar usuarios
            <ArrowUpRight size={18} />
          </Link>
        )}
      </section>
    </>
  );
}
