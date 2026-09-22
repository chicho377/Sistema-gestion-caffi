"use client";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { MailPlus, LoaderCircle } from "lucide-react";
import { inviteUser, updateUser } from "@/features/users/actions";
import type { Profile } from "@/lib/auth";
export function InviteForm() {
  const [state, action, pending] = useActionState(inviteUser, {});
  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);
  return (
    <form action={action} className="form-stack" aria-busy={pending}>
      <label>
        Nombre
        <input name="full_name" required maxLength={120} autoComplete="name" />
      </label>
      <label>
        Correo electrónico
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </label>
      <p className="small muted">
        Recibirá un correo para establecer su acceso como Colaborador.
      </p>
      {state.error && (
        <p role="alert" className="message error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="message success">
          {state.success}
        </p>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spinner" size={18} />
        ) : (
          <MailPlus size={18} />
        )}{" "}
        {pending ? "Enviando…" : "Enviar invitación"}
      </button>
    </form>
  );
}
export function UserForm({
  profile,
  self,
}: {
  profile: Profile;
  self: boolean;
}) {
  const [state, action, pending] = useActionState(updateUser, {});
  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);
  return (
    <form
      action={action}
      className="user-edit"
      aria-busy={pending}
      onSubmit={async (event) => {
        if (event.currentTarget.dataset.confirmed === "yes") {
          delete event.currentTarget.dataset.confirmed;
          return;
        }
        event.preventDefault();
        const form = event.currentTarget;
        const result = await Swal.fire({
          title: "¿Actualizar acceso?",
          text: "Cambiar el rol o estado modifica los permisos de esta persona. Un usuario inactivo pierde acceso al sistema.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Actualizar acceso",
          cancelButtonText: "Volver",
          confirmButtonColor: "#DD0675",
          cancelButtonColor: "#746873",
          returnFocus: true,
        });
        if (result.isConfirmed) {
          form.dataset.confirmed = "yes";
          form.requestSubmit();
        }
      }}
    >
      <input type="hidden" name="id" value={profile.id} />
      <label>
        Rol
        {self ? (
          <>
            <input type="hidden" name="role" value={profile.role} />
            <input value="Administrador (tu cuenta)" disabled />
          </>
        ) : (
          <select name="role" defaultValue={profile.role}>
            <option value="collaborator">Colaborador</option>
            <option value="admin">Administrador</option>
          </select>
        )}
      </label>
      <label>
        Estado
        <select name="status" defaultValue={profile.status}>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </select>
      </label>
      <button className="button secondary" disabled={pending}>
        {pending ? "Guardando…" : "Guardar acceso"}
      </button>
      {state.error && (
        <p className="message error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="sr-only" role="status">
          {state.success}
        </p>
      )}
    </form>
  );
}
