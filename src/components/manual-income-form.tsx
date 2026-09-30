"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Save } from "lucide-react";
import { toast } from "sonner";
import { registerIncome, voidIncome } from "@/features/manual-income/actions";
import { incomeTypes, paymentMethods } from "@/features/manual-income/domain";
import { cents } from "@/features/orders/domain";

export function ManualIncomeForm({ id, voidOnly = false }: { id: string; voidOnly?: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [error, setError] = useState(""); const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  function run(action: () => Promise<{ error?: string; success?: boolean }>) {
    setError(""); start(async () => {
      try {
        const result = await action(); if (result.error) { setError(result.error); return; }
        toast.success(voidOnly ? "Ingreso anulado; historial conservado" : "Ingreso registrado");
        router.replace(`/ingresos-manuales/${id}`); router.refresh();
      } catch { setError("No se pudo conectar. Conservamos tus datos; verifica el registro antes de reintentar."); }
    });
  }
  return <div className="quote-form" aria-busy={pending}>
    {error && <p className="message error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    {voidOnly ? <button className="button secondary danger-action" disabled={pending} onClick={async () => {
      const Swal = (await import("sweetalert2")).default;
      const result = await Swal.fire({ title: "Anular ingreso", text: "Se conservará el registro original. Esta acción no genera una devolución.", input: "textarea", inputLabel: "Motivo obligatorio", inputAttributes: { maxlength: "1000" }, inputValidator: (value: string) => !value.trim() ? "Escribe el motivo" : undefined, showCancelButton: true, confirmButtonText: "Anular ingreso", cancelButtonText: "Volver", confirmButtonColor: "#D92D47" });
      if (result.isConfirmed) run(() => voidIncome(id, result.value));
    }}><Ban size={18}/>Anular ingreso</button> : <form className="panel" onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const value = (key: string) => String(data.get(key) ?? "");
      try { if (cents(value("amount")) <= BigInt(0)) throw Error("El monto debe ser mayor que cero."); } catch (e) { setError((e as Error).message); return; }
      const payload = { amount: value("amount"), currency: "CRC", income_date: value("income_date") ? `${value("income_date")}-06:00` : "", income_type: value("income_type"), payment_method: value("payment_method"), description: value("description") };
      run(() => registerIncome(id, payload));
    }}>
      <h2>Registrar ingreso independiente</h2>
      <p className="muted">Los datos guardados se conservan. Para corregirlos, anula el ingreso y registra uno nuevo.</p>
      <fieldset className="quote-fields" disabled={pending}>
        <label>Monto en colones (CRC)<input name="amount" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" maxLength={100} placeholder="0.00" aria-describedby="income-amount-help"/></label>
        <label>Fecha efectiva (hora Costa Rica)<input name="income_date" type="datetime-local" aria-describedby="income-date-help"/></label>
        <label>Clasificación (opcional)<select name="income_type"><option value="">Sin clasificación</option>{Object.entries(incomeTypes).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Método (opcional)<select name="payment_method"><option value="">Sin especificar</option>{Object.entries(paymentMethods).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="quote-wide">Descripción (opcional)<textarea name="description" maxLength={3000} rows={3}/></label>
        <p id="income-amount-help" className="muted">Mayor que cero. Usa punto y hasta dos decimales.</p>
        <p id="income-date-help" className="muted">Deja la fecha vacía para registrar la hora actual. Puedes indicar una fecha histórica, nunca futura.</p>
        <button className="button primary"><Save size={18}/>{pending ? "Guardando…" : "Registrar ingreso"}</button>
      </fieldset>
    </form>}
    {error && !voidOnly && <Link className="button secondary" href={`/ingresos-manuales/${id}`}>Consultar si el ingreso se guardó</Link>}
  </div>;
}
