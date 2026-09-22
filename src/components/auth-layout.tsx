import Link from "next/link";
import { Flower2, Heart, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link href="/login" aria-label="SIGCA, inicio de sesión">
          <Brand />
        </Link>
        <div className="story-copy">
          <span className="eyebrow">HECHO CON CALMA. CREADO CON AMOR.</span>
          <h1>
            Cada puntada
            <br />
            tiene su historia.
          </h1>
          <p>
            Un espacio para cuidar de tu trabajo y de todo lo que creas con tus
            manos.
          </p>
          <div className="thread-art" aria-hidden>
            <Flower2 />
            <span>
              <Heart />
            </span>
          </div>
          <span className="handwritten">Aquí empieza algo bonito.</span>
        </div>
        <span className="story-footer">
          Gestión para tu emprendimiento de crochet
        </span>
      </section>
      <section className="auth-content">
        <div className="auth-card">
          <span className="eyebrow">BIENVENIDA A TU ESPACIO</span>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
          {children}
          <div className="auth-security">
            <ShieldCheck size={17} aria-hidden />
            <span>Acceso privado · Solo usuarios autorizados</span>
          </div>
        </div>
        <p className="auth-footer">Pequeños detalles. Grandes creaciones.</p>
      </section>
    </main>
  );
}
