import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  SettingsForm,
  ImageUpload,
  RefreshRate,
} from "@/components/catalog-forms";
import { exchangeRate } from "@/features/catalog/exchange";
export default async function Settings() {
  await requireAdmin();
  const { data, error } = await (
    await createClient()
  )
    .from("settings")
    .select(
      "id,business_name,phone,email,currency,deposit_percentage,hourly_rate,order_number_format,logo_path",
    )
    .single();
  if (error || !data) throw new Error("No se pudo cargar la configuración.");
  const rate = await exchangeRate();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Configuración</h1>
          <p className="muted">
            Los detalles que hacen único a tu emprendimiento.
          </p>
        </div>
      </div>
      <div className="catalog-detail">
        <section className="panel">
          <h2>Tu emprendimiento</h2>
          <SettingsForm row={data} />
        </section>
        <aside className="form-stack">
          <section className="panel">
            <h2>Logo</h2>
            {data.logo_path ? (
              <Image
                unoptimized
                src="/api/catalog-image/logo"
                alt="Logo del emprendimiento"
                width={220}
                height={180}
              />
            ) : (
              <p className="muted">
                Aquí aparecerá tu logo cuando lo agregues.
              </p>
            )}
            <ImageUpload productId={null} />
          </section>
          <section className="panel form-stack">
            <h2>Moneda y numeración</h2>
            <p>Productos y pedidos: colones (CRC).</p>
            <p>
              Formato de pedido: <strong>{data.order_number_format}</strong>
            </p>
            <p className="muted">
              Reinicio anual. No se generan pedidos en esta fase.
            </p>
          </section>
        </aside>
      </div>
      <section className="panel section-space form-stack">
        <h2>Tipo de cambio de venta</h2>
        {rate ? (
          <>
            <p className="exchange-value">1 USD = ₡{rate.sell_rate}</p>
            <p>Fecha del dato: {rate.rate_date}</p>
            <p className="muted">
              {rate.source} · consulta:{" "}
              {new Date(rate.fetched_at).toLocaleString("es-CR", {
                timeZone: "America/Costa_Rica",
              })}
              .{" "}
              {rate.cached
                ? "Última tasa guardada."
                : "Actualizado desde la fuente."}
            </p>
          </>
        ) : (
          <p className="message">
            Todavía no se ha obtenido una tasa válida. Las conversiones estarán
            disponibles después de la primera consulta exitosa.
          </p>
        )}
        <p className="muted">
          Si la fuente no responde, se conserva la última tasa obtenida. La
          conversión no modifica el importe original del material.
        </p>
        <RefreshRate />
      </section>
    </>
  );
}
