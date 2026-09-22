"use client";
import { useActionState } from "react";
import { ArrowRight, LoaderCircle, Mail, LockKeyhole } from "lucide-react";
import {
  login,
  recover,
  updatePassword,
  acceptEmailLink,
} from "@/features/auth/actions";
export function AuthForm({
  kind,
  tokenHash = "",
  tokenType = "",
  configured = true,
}: {
  kind: "login" | "recover" | "password" | "confirm";
  tokenHash?: string;
  tokenType?: string;
  configured?: boolean;
}) {
  const action = {
    login,
    recover,
    password: updatePassword,
    confirm: acceptEmailLink,
  }[kind];
  const [state, submit, pending] = useActionState(action, {});
  const label = {
    login: "Entrar a mi espacio",
    recover: "Enviar enlace",
    password: "Guardar contraseña",
    confirm: "Continuar de forma segura",
  }[kind];
  return (
    <form action={submit} className="form-stack" aria-busy={pending}>
      {(kind === "login" || kind === "recover") && (
        <label>
          Correo electrónico
          <div className="input-wrap">
            <Mail size={18} aria-hidden />
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="nombre@correo.com"
            />
          </div>
        </label>
      )}
      {(kind === "login" || kind === "password") && (
        <label>
          {kind === "password" ? "Nueva contraseña" : "Contraseña"}
          <div className="input-wrap">
            <LockKeyhole size={18} aria-hidden />
            <input
              name="password"
              type="password"
              autoComplete={
                kind === "login" ? "current-password" : "new-password"
              }
              required
              maxLength={4096}
            />
          </div>
        </label>
      )}
      {kind === "password" && (
        <label>
          Confirmar contraseña
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            maxLength={4096}
          />
        </label>
      )}
      {kind === "confirm" && (
        <>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={tokenType} />
        </>
      )}
      {state.error && (
        <p className="message error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="message success" role="status">
          {state.success}
        </p>
      )}
      {!configured && (
        <p className="message" role="status">
          El acceso estará disponible cuando la persona administradora complete
          la configuración del servicio.
        </p>
      )}
      <button
        className="button primary"
        disabled={pending || !configured || !!state.success}
      >
        {pending ? <LoaderCircle className="spinner" size={18} /> : null}
        {pending ? "Procesando…" : label}
        {!pending && <ArrowRight size={18} aria-hidden />}
      </button>
    </form>
  );
}
