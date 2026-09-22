import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Search, ArrowRight, PackageOpen } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { catalogs, isCatalog, type Row } from "@/features/catalog/schema";
import { columns } from "@/features/catalog/data";
import { exchangeRate } from "@/features/catalog/exchange";
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ catalog: string }>;
  searchParams: Promise<{ q?: string; state?: string; page?: string }>;
}) {
  const { catalog } = await params;
  if (!isCatalog(catalog)) notFound();
  const actor = await requireProfile();
  const config = catalogs[catalog];
  const p = await searchParams;
  const q = (p.q ?? "")
    .slice(0, 120)
    .replace(/[%_,()\\"]/g, "")
    .trim();
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(p.page ?? "1") || 1),
  );
  const state = ["active", "inactive"].includes(p.state ?? "")
    ? p.state
    : "all";
  const client = await createClient();
  let query = client
    .from(config.table)
    .select(columns(catalog), { count: "exact" });
  if (q)
    query =
      catalog === "productos"
        ? query.or("name.ilike.%" + q + "%,sku.ilike.%" + q + "%")
        : catalog === "materiales"
          ? query.or("name.ilike.%" + q + "%,code.ilike.%" + q + "%")
          : query.ilike("name", "%" + q + "%");
  if (state !== "all") query = query.eq("is_active", state === "active");
  const { data, error, count } = await query
    .order("name")
    .order("id")
    .range((page - 1) * 25, page * 25 - 1);
  if (error)
    throw new Error("No se pudo cargar el catálogo. Intenta nuevamente.");
  const rows = (data ?? []) as unknown as Row[];
  const costs: Record<string, { amount: number; currency: string }> = {};
  let rate = null;
  if (catalog === "materiales" && actor.role === "admin") {
    if (rows.length) {
      const { data: costData, error: costError } = await client
        .from("material_costs")
        .select("material_id,amount,currency")
        .in(
          "material_id",
          rows.map((r) => r.id),
        );
      if (costError) throw new Error("No se pudieron cargar los costos.");
      for (const c of costData ?? []) costs[c.material_id] = c;
    }
    rate = await exchangeRate();
  }
  const link = (n: number) =>
    "?" + new URLSearchParams({ q, state: state ?? "all", page: String(n) });
  const money = (n: unknown, currency = "CRC") =>
    new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency,
      maximumFractionDigits: 4,
    }).format(Number(n));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TU TALLER</span>
          <h1>{config.title}</h1>
          <p className="muted">{config.description}</p>
        </div>
        <Link className="button primary" href={"/" + catalog + "/nuevo"}>
          <Plus size={18} />
          Crear {config.singular.toLowerCase()}
        </Link>
      </div>
      {catalog === "materiales" && (
        <p className="message">
          Catálogo de materiales. Las existencias y movimientos estarán
          disponibles en una fase posterior.
        </p>
      )}
      <form className="catalog-search panel" method="get">
        <label>
          Buscar
          <input
            name="q"
            placeholder={
              catalog === "productos"
                ? "Nombre o SKU"
                : catalog === "materiales"
                  ? "Nombre o código"
                  : "Nombre"
            }
            defaultValue={q}
          />
        </label>
        <label>
          Estado
          <select name="state" defaultValue={state}>
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </label>
        <button className="button secondary">
          <Search size={18} />
          Buscar
        </button>
      </form>
      {rows.length === 0 ? (
        <section className="panel empty-catalog">
          <PackageOpen size={36} />
          <h2>
            {q || state !== "all"
              ? "Sin coincidencias"
              : "Tu catálogo empieza aquí"}
          </h2>
          <p className="muted">
            {q || state !== "all"
              ? "Prueba con otra búsqueda o estado."
              : "Crea el primer registro cuando lo necesites."}
          </p>
          <Link className="button secondary" href={"/" + catalog + "/nuevo"}>
            Crear {config.singular.toLowerCase()}
          </Link>
        </section>
      ) : (
        <div className="catalog-table-wrap">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Detalle</th>
                {catalog === "materiales" && actor.role === "admin" && (
                  <th>Costo unitario</th>
                )}
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  <td data-label="Nombre">
                    <strong>{String(row.name)}</strong>
                  </td>
                  <td data-label="Detalle">
                    {catalog === "clientes" ? (
                      String(row.phone ?? row.email ?? "Sin contacto")
                    ) : catalog === "categorias" ? (
                      String(row.description ?? "Sin descripción")
                    ) : catalog === "materiales" ? (
                      <>
                        {row.code} · {row.unit}
                        <br />
                        Mínimo: {row.min_stock}
                      </>
                    ) : (
                      <>
                        {row.sku}
                        <br />
                        {money(row.base_price)}
                      </>
                    )}
                  </td>
                  {catalog === "materiales" && actor.role === "admin" && (
                    <td data-label="Costo unitario">
                      {costs[String(row.id)] ? (
                        <>
                          {money(
                            costs[String(row.id)].amount,
                            costs[String(row.id)].currency,
                          )}
                          {costs[String(row.id)].currency === "USD" && (
                            <small>
                              {rate
                                ? "Equivalente: " +
                                  money(
                                    costs[String(row.id)].amount *
                                      Number(rate.sell_rate),
                                  )
                                : "Conversión pendiente de tasa"}
                            </small>
                          )}
                        </>
                      ) : (
                        "Pendiente"
                      )}
                    </td>
                  )}
                  <td data-label="Estado">
                    <span className="status-pill">
                      {row.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="button secondary"
                      href={"/" + catalog + "/" + row.id}
                    >
                      Ver / editar <ArrowRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rate && (
        <p className="muted rate-caption">
          Conversión de referencia: venta ₡{rate.sell_rate} por USD · dato{" "}
          {rate.rate_date} · {rate.source}.{" "}
          {rate.cached ? "Última tasa guardada." : "Consulta actualizada."}
        </p>
      )}
      <nav className="catalog-pagination" aria-label="Paginación">
        {page > 1 && (
          <Link className="button secondary" href={link(page - 1)}>
            Anterior
          </Link>
        )}
        <span>
          Página {page} · {count ?? 0} registros
        </span>
        {page * 25 < (count ?? 0) && (
          <Link className="button secondary" href={link(page + 1)}>
            Siguiente
          </Link>
        )}
      </nav>
    </>
  );
}
