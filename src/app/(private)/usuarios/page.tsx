import { requireAdmin, type Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InviteForm, UserForm } from "@/components/user-forms";
export default async function Users() {
  const actor = await requireAdmin();
  const client = await createClient();
  const { data, error } = await client
    .from("profiles")
    .select("id,full_name,email,role,status,created_at,last_access_at")
    .order("created_at");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Personas de tu equipo</h1>
          <p className="muted">
            Invita a quienes te acompañan y administra su acceso.
          </p>
        </div>
      </div>
      <div className="users-layout">
        <section className="panel">
          <h2>Invitar a una persona</h2>
          <InviteForm />
        </section>
        <section aria-label="Usuarios autorizados" className="user-list">
          {error ? (
            <p role="alert" className="message error">
              No pudimos cargar los usuarios. Intenta recargar la página.
            </p>
          ) : !data?.length ? (
            <div className="panel">
              <h2>No hay usuarios para mostrar</h2>
              <p>Usa el formulario para enviar una invitación.</p>
            </div>
          ) : (
            (data as Profile[]).map((profile) => (
              <article className="panel" key={profile.id}>
                <h2>{profile.full_name || "Sin nombre"}</h2>
                <p className="muted break-word">{profile.email}</p>
                <UserForm profile={profile} self={actor.id === profile.id} />
              </article>
            ))
          )}
        </section>
      </div>
    </>
  );
}
