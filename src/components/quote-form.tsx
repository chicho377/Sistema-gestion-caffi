"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, Save, Ban, ImagePlus, RotateCcw } from "lucide-react";
import Swal from "sweetalert2";
import { toast } from "sonner";
import { saveQuote, cancelQuote, operateOrder } from "@/features/orders/actions";
import { uploadQuoteFile } from "@/features/orders/files";
import { totals, money, validateDates, type Quote, type QuoteLine, type ClientOption, type ProductOption, type QuoteFile } from "@/features/orders/domain";

export function QuoteForm({ order, initialLines, clients, products, admin, today }: { order: Quote; initialLines: QuoteLine[]; clients: ClientOption[]; products: ProductOption[]; admin: boolean; today: string }) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [discount, setDiscount] = useState(order.discount_amount);
  const [date, setDate] = useState(order.order_date);
  const [product, setProduct] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const editable = order.production_status !== "cancelled";
  const financialEditable = editable && order.production_status !== "delivered";
  const historical = admin && date < today;
  let preview: ReturnType<typeof totals> | null = null;
  let previewError = "";
  try { preview = totals(lines, discount); } catch (e) { previewError = (e as Error).message; }
  function update(id: string, patch: Partial<QuoteLine>) { setLines((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function addLine() {
    const p = products.find((p) => p.id === product);
    setLines((rows) => [...rows, { id: crypto.randomUUID(), product_id: p?.id ?? null, product_sku_snapshot: p?.sku ?? null, product_name_snapshot: p?.name ?? "", description_snapshot: p?.description ?? "", quantity: "1", unit_price: p?.base_price ?? "0", discount_amount: "0", customization: "", notes: "", is_active: true }]);
    setProduct("");
  }
  return <form className="quote-form" onSubmit={(event) => {
    event.preventDefault(); setError(""); const data = new FormData(event.currentTarget);
    const requested = String(data.get("requested_delivery_date"));
    try { totals(lines, discount); validateDates(date, requested, admin, order.revision ? order.order_date : undefined); } catch (e) { setError((e as Error).message); return; }
    start(async () => {
      const payload = { client_id: String(data.get("client_id")), order_date: date, requested_delivery_date: requested, notes: String(data.get("notes") ?? ""), discount_amount: discount,
        items: lines.map((line) => ({ id: line.id, product_id: line.product_id, product_name_snapshot: line.product_name_snapshot, description_snapshot: line.description_snapshot, quantity: line.quantity, unit_price: line.unit_price, discount_amount: line.discount_amount, customization: line.customization, notes: line.notes, is_active: line.is_active })) };
      try {
        const result = order.production_status === "quote" ? await saveQuote(order.id, order.revision, payload) : await operateOrder("amend_order", order.id, order.revision, { ...payload, reason: String(data.get("reason") ?? ""), zero_reason: String(data.get("zero_reason") ?? "") });
        if (result.error) { setError(result.error); return; }
        toast.success(order.production_status === "quote" ? "Cotización guardada" : "Pedido actualizado"); router.push("/pedidos/" + result.id); router.refresh();
      } catch { setError("No se pudo conectar. Tus cambios siguen en pantalla; verifica el pedido antes de reintentar."); }
    });
  }}>
    <section className="panel">
      <h2>El encargo</h2>
      <fieldset disabled={!editable || pending} className="quote-fields">
        <label>Cliente<select name="client_id" required defaultValue={order.client_id}>
          <option value="">Selecciona un cliente</option>
          {clients.filter((c) => (admin || order.production_status === "quote" || c.id === order.client_id) && (c.is_active || c.id === order.client_id || historical)).map((c) => <option key={c.id} value={c.id}>{c.name}{!c.is_active ? " · Inactivo" : ""}</option>)}
        </select></label>
        <label>Fecha del pedido<input name="order_date" type="date" required max={today} min={admin ? undefined : (order.order_date < today ? order.order_date : today)} value={date} readOnly={!admin} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Entrega solicitada<input name="requested_delivery_date" type="date" required min={date} defaultValue={order.requested_delivery_date} /></label>
        <label className="quote-wide">Observaciones<textarea name="notes" rows={3} maxLength={3000} defaultValue={order.notes} /></label>
      </fieldset>
      {admin && historical && <p className="muted">Registro histórico autorizado. La fecha real de creación se conserva automáticamente.</p>}
    </section>
    <section className="panel">
      <h2>Puntadas de este encargo</h2>
      <p className="muted">Los precios y detalles guardados se conservan aunque cambie el catálogo.</p>
      {!lines.length && <p className="message">Todavía no hay líneas. Puedes guardar la cotización y completarla después.</p>}
      <div className="quote-lines">
        {lines.map((line, index) => <fieldset key={line.id} className={`quote-line ${line.is_active ? "" : "quote-line-inactive"}`} disabled={!financialEditable || pending}>
          <legend>Línea {index + 1} · {line.product_id ? line.product_sku_snapshot || "Catálogo" : "Personalizada"}{line.is_active ? "" : " · Inactiva"}</legend>
          <div className="quote-fields">
            <label className="quote-wide">Nombre<input aria-label={`Nombre línea ${index + 1}`} value={line.product_name_snapshot} readOnly={!!line.product_id} required maxLength={120} onChange={(e) => update(line.id, { product_name_snapshot: e.target.value })} /></label>
            <label className="quote-wide">Descripción<textarea aria-label={`Descripción línea ${index + 1}`} value={line.description_snapshot} readOnly={!!line.product_id} maxLength={3000} onChange={(e) => update(line.id, { description_snapshot: e.target.value })} /></label>
            <label>Cantidad<input aria-label={`Cantidad línea ${index + 1}`} inputMode="numeric" pattern="[1-9][0-9]*" required value={line.quantity} onChange={(e) => update(line.id, { quantity: e.target.value })} /></label>
            <label>Precio unitario CRC<input aria-label={`Precio línea ${index + 1}`} inputMode="decimal" required value={line.unit_price} onChange={(e) => update(line.id, { unit_price: e.target.value.replace(",", ".") })} /></label>
            <label>Descuento CRC<input aria-label={`Descuento línea ${index + 1}`} inputMode="decimal" required value={line.discount_amount} onChange={(e) => update(line.id, { discount_amount: e.target.value.replace(",", ".") })} /></label>
            <label>Personalización<textarea aria-label={`Personalización línea ${index + 1}`} maxLength={3000} value={line.customization} onChange={(e) => update(line.id, { customization: e.target.value })} /></label>
            <label>Notas<textarea aria-label={`Notas línea ${index + 1}`} maxLength={3000} value={line.notes} onChange={(e) => update(line.id, { notes: e.target.value })} /></label>
          </div>
          <div className="quote-line-footer"><strong>Total: {preview ? money(preview.lines[index]) : "Revisa los importes"}</strong>
            {financialEditable && <button type="button" className="button secondary" onClick={() => update(line.id, { is_active: !line.is_active })}>{line.is_active ? <Ban size={16}/> : <RotateCcw size={16}/>} {line.is_active ? "Desactivar" : "Activar"} línea {index + 1}</button>}
          </div>
        </fieldset>)}
      </div>
      {financialEditable && <div className="quote-add"><label>Agregar desde<select aria-label="Producto de catálogo" value={product} onChange={(e) => setProduct(e.target.value)} disabled={pending}>
        <option value="">Línea personalizada</option>{products.filter((p) => p.is_active || historical).map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}{p.is_active ? "" : " · Inactivo"}</option>)}
      </select></label><button type="button" className="button secondary" disabled={pending} onClick={addLine}><Plus size={18}/>Agregar línea</button></div>}
    </section>
    <section className="panel quote-summary">
      <label>Descuento general CRC<input inputMode="decimal" required disabled={!financialEditable || pending} value={discount} onChange={(e) => setDiscount(e.target.value.replace(",", "."))} /></label>
      {preview ? <dl><dt>Subtotal</dt><dd>{money(preview.subtotal)}</dd><dt>Total cotizado</dt><dd><strong>{money(preview.total)}</strong></dd></dl> : <p role="alert" className="message error">{previewError}</p>}
      <p className="muted">Importes en colones. El servidor valida el total y el saldo vigente al guardar.</p>
      {admin && editable && order.production_status !== "quote" && <label>Motivo del cambio de cliente (si corresponde)<textarea name="reason" maxLength={1000} /></label>}
      {admin && financialEditable && order.production_status !== "quote" && preview?.total === "0.00" && <label>Motivo de nueva autorización de total cero<textarea name="zero_reason" maxLength={1000} /></label>}
      {error && <p role="alert" className="message error">{error}</p>}
      {editable && <button className="button primary" disabled={pending || !preview}><Save size={18}/>{pending ? "Guardando…" : order.production_status === "quote" ? "Guardar cotización" : "Guardar cambios"}</button>}
    </section>
  </form>;
}
export function CancelQuoteButton({ id, revision }: { id: string; revision: number }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  return <><button type="button" className="button secondary" disabled={pending} onClick={async () => {
    const result = await Swal.fire({ title: "Cancelar cotización", text: "Se conservará el historial. Esta acción no permite reactivar la cotización.", input: "textarea", inputLabel: "Motivo obligatorio", inputAttributes: { maxlength: "1000" }, showCancelButton: true, confirmButtonText: "Cancelar cotización", cancelButtonText: "Volver", confirmButtonColor: "#D92D47", inputValidator: (value) => !value.trim() ? "Escribe el motivo" : undefined });
    if (!result.isConfirmed) return;
    start(async () => { try { const response = await cancelQuote(id, revision, result.value); if (response.error) setError(response.error); else { toast.success("Cotización cancelada"); router.refresh(); } } catch { setError("No se pudo conectar. Comprueba el estado antes de reintentar."); } });
  }}><Ban size={18}/>Cancelar cotización</button>{error && <p role="alert" className="message error">{error}</p>}</>;
}
export function QuoteFiles({ id, files, editable }: { id: string; files: QuoteFile[]; editable: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState("");
  return <section className="panel"><h2>Referencias del encargo</h2><p className="muted">Imágenes privadas JPEG, PNG o WebP. Hasta 5 MB y 25 megapíxeles, sin animación. Reemplazar conserva la versión anterior.</p>
    {!files.length && <p>No hay referencias todavía.</p>}
    <div className="image-grid">{files.map((file) => <figure key={file.id} className="image-card"><a href={`/api/order-file/${file.id}`} target="_blank" rel="noreferrer"><Image unoptimized src={`/api/order-file/${file.id}`} width={400} height={300} alt={file.caption || "Referencia del pedido"}/></a><figcaption>{file.caption || "Referencia"} · {file.is_active ? "Vigente" : "Versión anterior"}</figcaption></figure>)}</div>
    {editable && <form onSubmit={(event) => { event.preventDefault(); const element = event.currentTarget; const data = new FormData(element); setError(""); start(async () => { try { const result = await uploadQuoteFile(id, data); if (result.error) setError(result.error); else { element.reset(); toast.success("Referencia guardada"); router.refresh(); } } catch { setError("No se pudo conectar. Intenta nuevamente."); } }); }}>
      <fieldset className="quote-fields" disabled={pending}><label>Imagen de referencia<input type="file" name="image" accept="image/jpeg,image/png,image/webp" required /></label><label>Descripción de referencia<input name="caption" maxLength={300}/></label>
        <label>Reemplazar referencia<select name="replaces"><option value="">Agregar nueva referencia</option>{files.filter((f) => f.is_active).map((f) => <option key={f.id} value={f.id}>{f.caption || f.id.slice(0,8)}</option>)}</select></label>
        <button className="button secondary"><ImagePlus size={18}/>{pending ? "Subiendo…" : "Guardar referencia"}</button></fieldset>
    </form>}{error && <p role="alert" className="message error">{error}</p>}
  </section>;
}
