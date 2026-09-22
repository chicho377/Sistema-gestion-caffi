import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { catalogs, isCatalog, uuid, type Row } from "@/features/catalog/schema";
import { columns, allOptions } from "@/features/catalog/data";
import {
  CatalogForm,
  StatusButton,
  DuplicateForm,
  RelationForm,
  ImageUpload,
  ImageControls,
} from "@/components/catalog-forms";
export default async function CatalogDetail({
  params,
}: {
  params: Promise<{ catalog: string; id: string }>;
}) {
  const { catalog, id } = await params;
  if (!isCatalog(catalog) || (id !== "nuevo" && !uuid.test(id))) notFound();
  const actor = await requireProfile();
  const client = await createClient();
  let row: Row | undefined;
  if (id !== "nuevo") {
    const { data, error } = await client
      .from(catalogs[catalog].table)
      .select(columns(catalog))
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar el registro.");
    if (!data) notFound();
    row = data as unknown as Row;
    if (catalog === "materiales" && actor.role === "admin") {
      const { data: cost, error: costError } = await client
        .from("material_costs")
        .select("amount,currency")
        .eq("material_id", id)
        .maybeSingle();
      if (costError) throw new Error("No se pudo cargar el costo.");
      if (cost) row = { ...row, ...cost };
    }
  }
  const [categories, materials] = await Promise.all([
    catalog === "productos"
      ? allOptions("product_categories")
      : Promise.resolve([]),
    catalog === "productos" && row
      ? allOptions("materials")
      : Promise.resolve([]),
  ]);
  let relations: Row[] = [];
  let images: Row[] = [];
  if (catalog === "productos" && row) {
    const [result, photos] = await Promise.all([
      client
        .from("product_materials")
        .select("id,material_id,estimated_quantity,notes,is_active")
        .eq("product_id", id)
        .order("created_at"),
      client
        .from("product_images")
        .select("id,caption,is_main,is_active")
        .eq("product_id", id)
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("created_at"),
    ]);
    if (result.error || photos.error)
      throw new Error("No se pudieron cargar los materiales o fotografías.");
    relations = result.data ?? [];
    images = photos.data ?? [];
  }
  return (
    <>
      <Link className="back-link" href={"/" + catalog}>
        <ArrowLeft size={18} />
        Volver a {catalogs[catalog].title.toLowerCase()}
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{row ? "DETALLE" : "NUEVO REGISTRO"}</span>
          <h1>
            {row
              ? String(row.name)
              : "Crear " + catalogs[catalog].singular.toLowerCase()}
          </h1>
          {row && (
            <span className="status-pill">
              {row.is_active ? "Activo" : "Inactivo"}
            </span>
          )}
        </div>
        {row && (
          <StatusButton
            kind={catalog}
            id={id}
            active={Boolean(row.is_active)}
          />
        )}
      </div>
      <div className="catalog-detail">
        <section className="panel">
          <h2>Información general</h2>
          <CatalogForm
            key={id}
            kind={catalog}
            row={row}
            admin={actor.role === "admin"}
            categories={categories}
          />
        </section>
        <aside className="form-stack">
          {catalog === "clientes" && row && (
            <section className="panel">
              <h2>Historial de pedidos</h2>
              <p className="muted">
                Todavía no hay pedidos disponibles. El historial se mostrará
                cuando se habilite ese módulo.
              </p>
            </section>
          )}
          {catalog === "materiales" && (
            <section className="panel">
              <h2>Un catálogo para tu taller</h2>
              <p className="muted">
                El stock mínimo es un parámetro. No representa existencias
                reales ni registra consumo.
              </p>
            </section>
          )}
          {catalog === "productos" && row && (
            <>
              <DuplicateForm id={id} />
              <section className="panel">
                <h2>Fotografías</h2>
                <ImageUpload productId={id} />
              </section>
            </>
          )}
        </aside>
      </div>
      {catalog === "productos" && row && (
        <>
          <section className="panel section-space">
            <h2>Materiales estimados</h2>
            <p className="muted">
              Estas cantidades describen la pieza; no consumen inventario.
            </p>
            {relations.length === 0 && (
              <p className="message">Aún no hay materiales asociados.</p>
            )}
            <div className="relation-grid">
              {relations.map((r) => (
                <details key={String(r.id)} className="relation-card">
                  <summary>
                    {materials.find((m) => m.id === r.material_id)?.name ??
                      "Material"}{" "}
                    · {r.estimated_quantity} ·{" "}
                    {r.is_active ? "Activo" : "Inactivo"}
                  </summary>
                  <RelationForm productId={id} materials={materials} row={r} />
                </details>
              ))}
            </div>
            <details className="relation-card">
              <summary>Añadir material</summary>
              {materials.length ? (
                <RelationForm productId={id} materials={materials} />
              ) : (
                <p>
                  Primero <Link href="/materiales/nuevo">crea un material</Link>
                  .
                </p>
              )}
            </details>
          </section>
          <section className="panel section-space">
            <h2>Galería privada</h2>
            {images.length === 0 && (
              <p className="muted">
                Todavía no hay fotografías. Añade una imagen y elige cuál será
                la principal.
              </p>
            )}
            <div className="image-grid">
              {images.map((img) => (
                <article key={String(img.id)} className="image-card">
                  <Image
                    unoptimized
                    src={"/api/catalog-image/" + img.id}
                    alt={String(
                      img.caption || row?.name || "Fotografía del producto",
                    )}
                    width={480}
                    height={360}
                  />
                  <p>
                    {img.is_main ? "Principal" : "Referencia"}
                    {img.caption ? " · " + img.caption : ""}
                  </p>
                  <ImageControls
                    id={String(img.id)}
                    main={Boolean(img.is_main)}
                  />
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
