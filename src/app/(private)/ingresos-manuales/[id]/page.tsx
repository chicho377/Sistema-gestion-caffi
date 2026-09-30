import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/features/catalog/schema";
import { money } from "@/features/orders/domain";
import { incomeDate, incomeTypes, paymentMethods, type ManualIncome } from "@/features/manual-income/domain";
import { ManualIncomeForm } from "@/components/manual-income-form";
export default async function IncomeDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); const { id } = await params;
  const intro = <><Link className="button secondary" href="/ingresos-manuales">Volver a ingresos manuales</Link><p className="message">Ingresos manuales son únicamente ingresos que no provienen de pedidos. Registra los pagos de encargos desde <Link href="/pedidos">Pedidos</Link>.</p></>;
  if (id === "nuevo") return <>{intro}<h1>Nuevo ingreso manual</h1><ManualIncomeForm id={randomUUID()}/></>;
  if (!uuid.test(id)) notFound();
  const client = await createClient();
  const { data, error } = await client.from("manual_income_read").select("*").eq("id",id).maybeSingle();
  if (error) throw Error("No se pudo cargar el ingreso."); if (!data) notFound();
  const row = data as ManualIncome;
  const { data: events, error: historyError } = await client.from("audit_log").select("id,action,user_id,created_at,reason").eq("entity_type","manual_income").eq("entity_id",id).order("created_at").limit(10);
  if (historyError) throw Error("No se pudo cargar el historial.");
  const actorIds = [...new Set([row.created_by, row.voided_by].filter((x): x is string => !!x))];
  const { data: actors, error: actorsError } = await client.from("profiles").select("id,full_name").in("id",actorIds);
  if (actorsError) throw Error("No se pudieron cargar los responsables.");
  const actorName = (key: string) => actors?.find(a=>a.id===key)?.full_name ?? key;
  return <>{intro}<div className="page-heading"><div><span className="eyebrow">REGISTRO INDEPENDIENTE</span><h1>Detalle de ingreso</h1></div><span className="status-pill">{row.status === "valid" ? "Válido" : "Anulado"}</span></div>
    <section className="panel"><dl className="order-amounts"><div><dt>Monto CRC</dt><dd>{money(row.amount)}</dd></div><div><dt>Fecha efectiva · Costa Rica</dt><dd>{incomeDate(row.income_date)}</dd></div><div><dt>Clasificación</dt><dd>{incomeTypes[row.income_type ?? ""] ?? "Sin clasificación"}</dd></div><div><dt>Método</dt><dd>{paymentMethods[row.payment_method ?? ""] ?? "Sin especificar"}</dd></div><div><dt>Registrado por</dt><dd>{actorName(row.created_by)}</dd></div><div><dt>Registro en SIGCA</dt><dd>{incomeDate(row.created_at)}{row.is_historical ? " · Histórico" : ""}</dd></div></dl><h2>Descripción</h2><p className="break-word">{row.description ?? "Sin descripción"}</p>
      {row.status === "valid" ? <ManualIncomeForm id={id} voidOnly/> : <p className="message break-word">Anulado por {actorName(row.voided_by!)} el {incomeDate(row.voided_at!)}. Motivo: {row.void_reason}. El registro original se conserva.</p>}
    </section>
    <section className="panel quote-form"><h2>Historial del ingreso</h2><ol className="order-history">{events?.map(event=><li key={event.id}><strong>{event.action === "manual_income.created" ? "Ingreso registrado" : "Ingreso anulado"}</strong><span>{incomeDate(event.created_at)} · {actorName(event.user_id)}</span>{event.reason && <p>{event.reason}</p>}</li>)}</ol></section>
  </>;
}
