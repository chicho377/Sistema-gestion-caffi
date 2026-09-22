export type Catalog = "clientes" | "categorias" | "materiales" | "productos";
export type Row = Record<string, string | number | boolean | null>;
export type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "textarea" | "checkbox" | "select";
  required?: boolean;
  max?: number;
  options?: { id: string; name: string }[];
  min?: number;
};
export const catalogs: Record<
  Catalog,
  {
    title: string;
    singular: string;
    table: string;
    description: string;
    fields: Field[];
  }
> = {
  clientes: {
    title: "Clientes",
    singular: "Cliente",
    table: "clients",
    description: "Cada creación comienza con alguien especial.",
    fields: [
      { name: "name", label: "Nombre", required: true, max: 120 },
      { name: "phone", label: "Teléfono / WhatsApp", max: 25 },
      { name: "email", label: "Correo electrónico", type: "email", max: 254 },
      { name: "address", label: "Dirección", type: "textarea", max: 1000 },
      { name: "location", label: "Ubicación", max: 300 },
      { name: "notes", label: "Notas", type: "textarea", max: 3000 },
    ],
  },
  categorias: {
    title: "Categorías",
    singular: "Categoría",
    table: "product_categories",
    description: "Organiza tus creaciones con cuidado.",
    fields: [
      { name: "name", label: "Nombre", required: true, max: 100 },
      {
        name: "description",
        label: "Descripción",
        type: "textarea",
        max: 1000,
      },
    ],
  },
  materiales: {
    title: "Materiales",
    singular: "Material",
    table: "materials",
    description: "Los pequeños detalles que dan vida a tus ideas.",
    fields: [
      { name: "code", label: "Código", required: true, max: 60 },
      { name: "name", label: "Nombre", required: true, max: 120 },
      { name: "category", label: "Categoría", required: true, max: 100 },
      { name: "unit", label: "Unidad de medida", required: true, max: 40 },
      {
        name: "min_stock",
        label: "Stock mínimo",
        type: "number",
        required: true,
        min: 0,
      },
    ],
  },
  productos: {
    title: "Productos",
    singular: "Producto",
    table: "products",
    description: "Tu catálogo de piezas hechas con cariño.",
    fields: [
      { name: "sku", label: "SKU", required: true, max: 60 },
      { name: "name", label: "Nombre", required: true, max: 120 },
      { name: "category_id", label: "Categoría", type: "select" },
      {
        name: "description",
        label: "Descripción",
        type: "textarea",
        max: 3000,
      },
      {
        name: "base_price",
        label: "Precio base (CRC)",
        type: "number",
        required: true,
        min: 0,
      },
      {
        name: "estimated_minutes",
        label: "Tiempo estimado (minutos)",
        type: "number",
        min: 0,
      },
      { name: "is_customizable", label: "Personalizable", type: "checkbox" },
      {
        name: "customization_notes",
        label: "Observaciones de personalización",
        type: "textarea",
        max: 3000,
      },
    ],
  },
};
export function isCatalog(value: string): value is Catalog {
  return Object.hasOwn(catalogs, value);
}
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateFields(fields: Field[], data: FormData): Row {
  const result: Row = {};
  for (const f of fields) {
    if (f.type === "checkbox") {
      result[f.name] = data.get(f.name) === "on";
      continue;
    }
    const raw = data.get(f.name);
    if (raw !== null && typeof raw !== "string")
      throw new Error("Campo inválido.");
    const v = (raw ?? "").trim();
    if (!v) {
      if (f.required) throw new Error(f.label + ": completa este campo.");
      result[f.name] = null;
      continue;
    }
    if (v.length > (f.max ?? 3000))
      throw new Error(f.label + ": texto demasiado largo.");
    if (f.type === "number") {
      if (
        !/^\d+(\.\d+)?$/.test(v) ||
        !Number.isFinite(Number(v)) ||
        Number(v) < (f.min ?? 0)
      )
        throw new Error(f.label + ": número inválido.");
      if (
        f.name === "estimated_minutes" &&
        (!Number.isSafeInteger(Number(v)) || Number(v) > 2147483647)
      )
        throw new Error("Indica minutos enteros válidos.");
      result[f.name] = v;
    } else {
      if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        throw new Error("Correo electrónico inválido.");
      if (f.name === "phone" && !/^\+?[0-9 ()-]{8,25}$/.test(v))
        throw new Error("Teléfono inválido.");
      if (f.name.endsWith("_id") && !uuid.test(v))
        throw new Error("Selección inválida.");
      result[f.name] = v;
    }
  }
  return result;
}
export const settingsFields: Field[] = [
  {
    name: "business_name",
    label: "Nombre del emprendimiento",
    required: true,
    max: 120,
  },
  { name: "phone", label: "Teléfono", required: true, max: 25 },
  {
    name: "email",
    label: "Correo electrónico",
    type: "email",
    required: true,
    max: 254,
  },
  {
    name: "deposit_percentage",
    label: "Adelanto habitual (%)",
    type: "number",
    required: true,
    min: 0,
  },
  {
    name: "hourly_rate",
    label: "Valor de hora (CRC) — pendiente si está vacío",
    type: "number",
    min: 0,
  },
];
export const costFields: Field[] = [
  {
    name: "amount",
    label: "Costo unitario actual — pendiente si está vacío",
    type: "number",
    min: 0,
  },
  {
    name: "currency",
    label: "Moneda del costo",
    type: "select",
    options: [
      { id: "CRC", name: "Colones (CRC)" },
      { id: "USD", name: "Dólares (USD)" },
    ],
  },
];
