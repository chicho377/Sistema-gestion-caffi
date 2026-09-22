"use client";
import { useId, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { Save, Power, Copy, Upload, Star, RefreshCw } from "lucide-react";
import {
  catalogs,
  costFields,
  settingsFields,
  type Catalog,
  type Field,
  type Row,
} from "@/features/catalog/schema";
import {
  saveCatalog,
  changeActive,
  saveSettings,
  duplicateProduct,
  saveRelation,
  refreshExchange,
  type Result,
} from "@/features/catalog/actions";
import { uploadImage, imageAction } from "@/features/catalog/images";
const subscribeHydration = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
}
function Fields({ fields, value = {} }: { fields: Field[]; value?: Row }) {
  const ready = useHydrated();
  const fieldGroup = useId();
  return (
    <>
      {fields.map((f) => (
        <label
          className={f.type === "checkbox" ? "check-field" : ""}
          key={f.name}
        >
          {f.type !== "checkbox" && (
            <span id={fieldGroup + "-" + f.name}>
              {f.label}
              {f.required ? " *" : ""}
            </span>
          )}
          {f.type === "textarea" ? (
            <textarea
              disabled={!ready}
              name={f.name}
              aria-labelledby={fieldGroup + "-" + f.name}
              maxLength={f.max}
              defaultValue={String(value[f.name] ?? "")}
              rows={3}
            />
          ) : f.type === "select" ? (
            <select
              disabled={!ready}
              name={f.name}
              aria-labelledby={fieldGroup + "-" + f.name}
              required={f.required}
              defaultValue={String(
                value[f.name] ?? (f.name === "currency" ? "CRC" : ""),
              )}
            >
              {f.name !== "currency" && <option value="">Seleccionar</option>}
              {f.options?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : f.type === "checkbox" ? (
            <>
              <input
                disabled={!ready}
                name={f.name}
                type="checkbox"
                defaultChecked={Boolean(value[f.name])}
              />
              <span>{f.label}</span>
            </>
          ) : (
            <input
              disabled={!ready}
              name={f.name}
              type={f.type ?? "text"}
              aria-labelledby={fieldGroup + "-" + f.name}
              defaultValue={String(value[f.name] ?? "")}
              maxLength={f.max}
              required={f.required}
              min={f.min}
              step={
                f.type === "number"
                  ? f.name === "estimated_minutes"
                    ? "1"
                    : "any"
                  : undefined
              }
              inputMode={f.type === "number" ? "decimal" : undefined}
            />
          )}
        </label>
      ))}
    </>
  );
}
function useSave() {
  const ready = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function run(
    action: () => Promise<Result>,
    next?: (r: Result) => void,
  ) {
    setPending(true);
    setError("");
    try {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Cambios guardados");
      next?.(result);
      router.refresh();
    } catch {
      setError(
        "No se pudo completar la operación. Revisa tu conexión e intenta nuevamente.",
      );
    } finally {
      setPending(false);
    }
  }
  return { pending: pending || !ready, error, run };
}
function Feedback({ error, pending }: { error: string; pending: boolean }) {
  return (
    <>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={pending}>
        <Save size={18} />
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </>
  );
}
export function CatalogForm({
  kind,
  row,
  admin,
  categories = [],
}: {
  kind: Catalog;
  row?: Row;
  admin: boolean;
  categories?: { id: string; name: string }[];
}) {
  const { pending, error, run } = useSave();
  const router = useRouter();
  const fields = catalogs[kind].fields.map((f) =>
    f.name === "category_id" ? { ...f, options: categories } : f,
  );
  return (
    <form
      className="form-stack catalog-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void run(
          () => saveCatalog(kind, row?.id ? String(row.id) : null, data),
          (r) => {
            if (r.id) router.push("/" + kind + "/" + r.id);
          },
        );
      }}
    >
      <Fields fields={fields} value={row} />
      {kind === "materiales" && admin && (
        <fieldset>
          <legend>Costo · Solo Administración</legend>
          <Fields fields={costFields} value={row} />
          <p className="muted">
            El importe conserva su moneda original. Dejar vacío conserva el
            costo existente, o lo deja pendiente al crear.
          </p>
        </fieldset>
      )}
      <input
        type="hidden"
        name="is_active"
        value={String(row?.is_active ?? true)}
      />
      <Feedback error={error} pending={pending} />
    </form>
  );
}
export function StatusButton({
  kind,
  id,
  active,
}: {
  kind: Catalog;
  id: string;
  active: boolean;
}) {
  const { pending, error, run } = useSave();
  return (
    <>
      <button
        type="button"
        className="button secondary"
        disabled={pending}
        onClick={async () => {
          const confirmation = await Swal.fire({
            title: active ? "¿Desactivar registro?" : "¿Activar registro?",
            text: "Se conservará toda su información e historial.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: active ? "Desactivar" : "Activar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#DD0675",
          });
          if (confirmation.isConfirmed)
            await run(() => changeActive(kind, id, !active));
        }}
      >
        <Power size={18} />
        {active ? "Desactivar" : "Activar"}
      </button>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
    </>
  );
}
export function SettingsForm({ row }: { row: Row }) {
  const { pending, error, run } = useSave();
  return (
    <form
      className="form-stack catalog-form"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        void run(() => saveSettings(d));
      }}
    >
      <Fields fields={settingsFields} value={row} />
      <Feedback error={error} pending={pending} />
    </form>
  );
}
export function DuplicateForm({ id }: { id: string }) {
  const { pending, error, run } = useSave();
  const router = useRouter();
  return (
    <details className="panel">
      <summary>
        <Copy size={18} /> Duplicar producto
      </summary>
      <p className="muted">
        Crea una variante con nuevo SKU. Conserva información, materiales
        estimados y referencias de imágenes.
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void run(
            () => duplicateProduct(id, d),
            (r) => router.push("/productos/" + r.id),
          );
        }}
      >
        <Fields fields={catalogs.productos.fields.slice(0, 2)} />
        <Feedback pending={pending} error={error} />
      </form>
    </details>
  );
}
export function RelationForm({
  productId,
  materials,
  row,
}: {
  productId: string;
  materials: { id: string; name: string }[];
  row?: Row;
}) {
  const { pending, error, run } = useSave();
  return (
    <form
      className="form-stack relation-form"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        void run(() => saveRelation(productId, d));
      }}
    >
      {row && <input name="id" type="hidden" value={String(row.id)} />}
      <Fields
        value={row}
        fields={[
          {
            name: "material_id",
            label: "Material",
            type: "select",
            required: true,
            options: materials,
          },
          {
            name: "estimated_quantity",
            label: "Cantidad estimada",
            type: "number",
            required: true,
            min: 0,
          },
          { name: "notes", label: "Notas", max: 1000 },
        ]}
      />
      {row && (
        <label>
          Estado
          <select name="is_active" defaultValue={String(row.is_active)}>
            <option value="true">Activo</option>
            <option value="false">Inactivo (conservar historial)</option>
          </select>
        </label>
      )}
      <Feedback pending={pending} error={error} />
    </form>
  );
}
export function ImageUpload({ productId }: { productId: string | null }) {
  const { pending, error, run } = useSave();
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        void run(() => uploadImage(productId, d));
      }}
    >
      <label>
        <span>
          <Upload size={18} /> {productId ? "Añadir fotografía" : "Subir logo"}
        </span>
        <input
          name="image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
        />
      </label>
      <p className="muted">
        JPEG, PNG o WebP. Hasta 5 MB, sin animación. Acceso privado.
      </p>
      {productId && (
        <label>
          Descripción de la imagen
          <input name="caption" maxLength={300} />
        </label>
      )}
      <Feedback pending={pending} error={error} />
    </form>
  );
}
export function ImageControls({ id, main }: { id: string; main: boolean }) {
  const { pending, error, run } = useSave();
  return (
    <div className="form-stack">
      {!main && (
        <button
          className="button secondary"
          disabled={pending}
          onClick={() => void run(() => imageAction(id, "main"))}
        >
          <Star size={18} />
          Hacer principal
        </button>
      )}
      <button
        className="button secondary"
        disabled={pending}
        onClick={async () => {
          const confirmation = await Swal.fire({
            title: "¿Retirar esta fotografía?",
            text: "Se conservará el archivo privado y su historial.",
            showCancelButton: true,
            confirmButtonText: "Retirar",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#DD0675",
          });
          if (confirmation.isConfirmed)
            await run(() => imageAction(id, "deactivate"));
        }}
      >
        Retirar del catálogo
      </button>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
    </div>
  );
}
export function RefreshRate() {
  const { pending, error, run } = useSave();
  return (
    <>
      <button
        className="button secondary"
        disabled={pending}
        onClick={() => void run(refreshExchange)}
      >
        <RefreshCw size={18} />
        {pending ? "Consultando…" : "Actualizar tipo de cambio"}
      </button>
      {error && (
        <p role="status" className="message">
          {error}
        </p>
      )}
    </>
  );
}
