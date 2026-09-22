// Opt-in: usa SIGCA DEV real. Crea datos identificados de prueba y los desactiva al terminar.
// No guarda tokens, enlaces, contraseñas, trazas ni estado de navegador.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
if (process.env.SIGCA_REAL_TESTS !== "1")
  throw Error("Requiere SIGCA_REAL_TESTS=1");
process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (url !== "https://pysgfnwsycgoneaecgcl.supabase.co")
  throw Error("Proyecto incorrecto");
const privileged = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const browser = await chromium.launch();
const sessions = [];
const records = [];
let admin, member;
let stage = "inicio";
let memberDeactivated = false;
const prefix = "VERIFICACION-F2-" + Date.now();
function ok(value, label) {
  if (!value) throw Error(label);
  console.log("PASS: " + label);
}
async function session(email) {
  if (!email) throw Error("Falta correo de prueba");
  const { data: users } = await privileged.auth.admin.listUsers();
  const identity = users?.users.find((u) => u.email === email);
  if (!identity?.email_confirmed_at)
    throw Error("Cuenta existente y confirmada requerida");
  const { data: link, error } = await privileged.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw Error("No se pudo iniciar sesión de prueba");
  const jar = new Map();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const verified = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (verified.error) throw Error("No se pudo verificar sesión");
  const context = await browser.newContext();
  await context.addCookies(
    [...jar].map(([name, value]) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    })),
  );
  const value = {
    client,
    context,
    page: await context.newPage(),
    id: identity.id,
  };
  sessions.push(value);
  return value;
}
async function go(who, path) {
  stage = path;
  await who.page.goto("http://localhost:3000" + path);
}
async function saved(page) {
  await expect(page.locator("main [role=alert]")).toHaveCount(0);
  await expect(page).toHaveURL(/\/[a-f0-9-]{36}$/, { timeout: 20000 });
  return page.url().split("/").at(-1);
}
try {
  admin = await session(process.env.SIGCA_TEST_ADMIN_EMAIL);
  member = await session(process.env.SIGCA_TEST_MEMBER_EMAIL);
  const ap = (
    await admin.client
      .from("profiles")
      .select("role,status")
      .eq("id", admin.id)
      .single()
  ).data;
  const mp = (
    await member.client
      .from("profiles")
      .select("role,status")
      .eq("id", member.id)
      .single()
  ).data;
  ok(
    ap?.role === "admin" &&
      mp?.role === "collaborator" &&
      ap.status === "active" &&
      mp.status === "active",
    "Identidades Admin y Colaborador activas",
  );
  await go(admin, "/configuracion");
  await expect(
    admin.page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await expect(admin.page.getByText(/1 USD =/)).toBeVisible({ timeout: 20000 });
  ok(true, "Cotización real obtenida y persistida");
  const settings = (await admin.client.from("settings").select("*").single())
    .data;
  ok(settings.business_name === "caffi crochet", "Configuración inicial real");
  await admin.page
    .getByRole("button", { name: "Guardar", exact: true })
    .first()
    .click();
  await expect(admin.page.getByText("Cambios guardados").first()).toBeVisible();
  ok(true, "Admin guarda configuración existente desde UI");
  for (const table of [
    "settings",
    "material_costs",
    "audit_log",
    "exchange_rates",
  ]) {
    const r = await member.client.from(table).select("*");
    ok(
      !r.error && r.data.length === 0,
      "API no entrega " + table + " a Colaborador",
    );
  }
  const costInsert = await member.client
    .from("material_costs")
    .insert({ material_id: crypto.randomUUID(), amount: 1, currency: "USD" });
  ok(!!costInsert.error, "Escritura financiera directa rechazada");
  const settingsUpdate = await member.client
    .from("settings")
    .update({ hourly_rate: 1 })
    .eq("singleton", true)
    .select("id");
  ok(
    !settingsUpdate.error && settingsUpdate.data.length === 0,
    "Configuración financiera protegida",
  );
  await go(member, "/configuracion");
  await expect(member.page).toHaveURL(/notice=forbidden/);
  await go(member, "/clientes/nuevo");
  await member.page.getByLabel("Nombre *").fill(prefix + " Cliente");
  await member.page.getByLabel("Teléfono / WhatsApp").fill("83639663");
  await member.page
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  const clientId = await saved(member.page);
  records.push(["clients", clientId]);
  ok(true, "Cliente creado desde UI Colaborador");
  await member.page
    .getByLabel("Notas", { exact: true })
    .fill("Verificación de edición e historial vacío");
  await member.page
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(
    member.page.getByText("Cambios guardados").first(),
  ).toBeVisible();
  await expect(
    member.page.getByText("Todavía no hay pedidos disponibles.", {
      exact: false,
    }),
  ).toBeVisible();
  await go(member, "/clientes");
  await member.page
    .getByLabel("Buscar", { exact: true })
    .fill(prefix + " Cliente");
  await member.page
    .getByRole("button", { name: "Buscar", exact: true })
    .click();
  await expect(member.page.locator("tbody tr")).toHaveCount(1);
  ok(true, "Búsqueda real filtra el cliente solicitado");
  await go(member, "/categorias/nuevo");
  await member.page.getByLabel("Nombre *").fill(prefix + " Categoría");
  await member.page
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  const categoryId = await saved(member.page);
  records.push(["product_categories", categoryId]);
  const duplicateCat = await member.client
    .from("product_categories")
    .insert({ name: (prefix + " Categoría").toLowerCase() + " " });
  ok(
    duplicateCat.error?.code === "23505",
    "Categoría duplicada rechazada por API",
  );
  await go(member, "/materiales/nuevo");
  await member.page.getByLabel("Código *").fill(prefix + "-MAT");
  await member.page.getByLabel("Nombre *").fill(prefix + " Material");
  await member.page.getByLabel("Categoría *").fill("Hilos");
  await member.page.getByLabel("Unidad de medida *").fill("g");
  await member.page.getByLabel("Stock mínimo *").fill("1.5");
  await expect(member.page.locator('input[name="amount"]')).toHaveCount(0);
  await member.page
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  const materialId = await saved(member.page);
  records.push(["materials", materialId]);
  const pending = await admin.client
    .from("material_costs")
    .select("id")
    .eq("material_id", materialId);
  ok(
    !pending.error && !pending.data.length,
    "Material creado sin costo supuesto",
  );
  await go(admin, "/materiales/" + materialId);
  await admin.page
    .getByLabel("Costo unitario actual", { exact: false })
    .fill("12.345");
  await admin.page.getByLabel("Moneda del costo").selectOption("USD");
  await admin.page
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(admin.page.getByText("Cambios guardados").first()).toBeVisible();
  const cost = await admin.client
    .from("material_costs")
    .select("amount,currency")
    .eq("material_id", materialId)
    .single();
  ok(
    cost.data?.amount === 12.345 && cost.data?.currency === "USD",
    "Admin guarda costo original USD",
  );
  const operational = await member.client
    .from("materials")
    .select("*")
    .eq("id", materialId)
    .single();
  ok(
    !("amount" in operational.data) && !("currency" in operational.data),
    "SELECT * operativo sin columnas de costo",
  );
  await go(member, "/materiales/" + materialId);
  ok(
    !(await member.page.locator("main").textContent()).includes("12.345"),
    "UI Colaborador sin costo",
  );
  const memberHtml = await member.context.request.get(
    "http://localhost:3000/materiales/" + materialId,
  );
  ok(
    !(await memberHtml.text()).includes("12.345"),
    "HTML/RSC Colaborador no recibe importe restringido",
  );
  await go(member, "/productos/nuevo");
  await member.page.getByLabel("SKU *").fill(prefix + "-SKU");
  await member.page.getByLabel("Nombre *").fill(prefix + " Producto");
  await member.page
    .getByLabel("Categoría", { exact: true })
    .selectOption(categoryId);
  await member.page.getByLabel("Precio base (CRC) *").fill("2500");
  await member.page.getByLabel("Tiempo estimado").fill("30");
  await member.page.getByLabel("Personalizable", { exact: true }).check();
  await member.page
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  const productId = await saved(member.page);
  records.push(["products", productId]);
  const duplicateSku = await member.client.from("products").insert({
    sku: (prefix + "-SKU").toLowerCase(),
    name: "Duplicado",
    base_price: 1,
  });
  ok(duplicateSku.error?.code === "23505", "SKU duplicado rechazado por API");
  const invalid = await member.client.from("product_materials").insert({
    product_id: productId,
    material_id: crypto.randomUUID(),
    estimated_quantity: 1,
  });
  ok(invalid.error?.code === "23503", "Relación inválida rechazada por API");
  await member.page.getByText("Añadir material", { exact: true }).click();
  const relation = member.page.locator("form.relation-form").last();
  await relation.getByLabel("Material *").selectOption(materialId);
  await relation.getByLabel("Cantidad estimada *").fill("2.5");
  await relation.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(member.page.getByText(/Material · 2.5/)).toBeVisible();
  ok(true, "Relación producto/material desde UI");
  const deniedUpload = await member.client.storage
    .from("catalog-images")
    .upload("products/forged.webp", Buffer.from("fake"), {
      contentType: "image/webp",
    });
  ok(!!deniedUpload.error, "Carga directa sin validación servidor rechazada");
  await member.page.locator('input[type="file"]').setInputFiles({
    name: "falsa.png",
    mimeType: "image/png",
    buffer: Buffer.from("no-image"),
  });
  const photoForm = member.page
    .locator("form")
    .filter({ has: member.page.locator('input[type="file"]') });
  await photoForm.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(photoForm.getByRole("alert")).toContainText("Imagen inválida");
  const png = await sharp({
    create: { width: 320, height: 240, channels: 3, background: "#FFD6E4" },
  })
    .png()
    .toBuffer();
  await member.page
    .locator('input[type="file"]')
    .setInputFiles({ name: "prueba.png", mimeType: "image/png", buffer: png });
  await photoForm.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    member.page.getByRole("button", { name: "Hacer principal" }),
  ).toBeVisible({ timeout: 20000 });
  await member.page.getByRole("button", { name: "Hacer principal" }).click();
  await expect(
    member.page.getByText("Principal", { exact: true }),
  ).toBeVisible();
  const photos = await member.client
    .from("product_images")
    .select("id,path")
    .eq("product_id", productId)
    .eq("is_active", true);
  ok(
    photos.data?.length === 1,
    "Imagen validada registrada en Storage privado",
  );
  const imageId = photos.data[0].id;
  records.push(["product_images", imageId]);
  const publicClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  const unauthorized = await publicClient.storage
    .from("catalog-images")
    .download(photos.data[0].path);
  ok(!!unauthorized.error, "Descarga anónima denegada");
  const noSession = await browser.newContext();
  const response = await noSession.request.get(
    "http://localhost:3000/api/catalog-image/" + imageId,
  );
  ok(response.status() === 401, "Ruta imagen sin sesión rechazada");
  await noSession.close();
  await member.page.getByText("Duplicar producto", { exact: true }).click();
  const duplicateForm = member.page.locator("details.panel form");
  await duplicateForm.getByLabel("SKU *").fill(prefix + "-COPY");
  await duplicateForm.getByLabel("Nombre *").fill(prefix + " Copia");
  await duplicateForm
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(member.page).not.toHaveURL(new RegExp(productId + "$"));
  const copyId = await saved(member.page);
  records.push(["products", copyId]);
  const cloned = await member.client
    .from("product_materials")
    .select("id")
    .eq("product_id", copyId);
  ok(cloned.data?.length === 1, "Duplicación conserva materiales");
  const clonedImages = await member.client
    .from("product_images")
    .select("id")
    .eq("product_id", copyId);
  ok(
    clonedImages.data?.length === 1,
    "Duplicación conserva referencias privadas",
  );
  for (const img of clonedImages.data ?? [])
    records.push(["product_images", img.id]);
  await mkdir("test-results/phase2-real", { recursive: true });
  for (const width of [320, 375, 768, 1024, 1440]) {
    await member.page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/clientes",
      "/clientes/" + clientId,
      "/categorias",
      "/materiales",
      "/materiales/" + materialId,
      "/productos",
      "/productos/" + productId,
    ]) {
      await go(member, path);
      ok(
        await member.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "Responsive real " + width + " " + path.split("/")[1],
      );
    }
    await member.page.screenshot({
      path: "test-results/phase2-real/product-" + width + ".png",
      fullPage: true,
    });
    await admin.page.setViewportSize({ width, height: 900 });
    await go(admin, "/configuracion");
    ok(
      await admin.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Configuración responsive " + width,
    );
  }
  await go(member, "/clientes/" + clientId);
  await member.page
    .getByRole("button", { name: "Desactivar", exact: true })
    .click();
  await member.page
    .getByRole("button", { name: "Desactivar", exact: true })
    .last()
    .click();
  await expect(
    member.page.getByRole("button", { name: "Activar", exact: true }),
  ).toBeVisible();
  ok(true, "Desactivación UI conserva registro");
  await go(member, "/productos/" + productId);
  stage = "usuario inactivo";
  const disabled = await admin.client
    .from("profiles")
    .update({ status: "inactive" })
    .eq("id", member.id);
  ok(!disabled.error, "Desactivación temporal Colaborador");
  memberDeactivated = true;
  const inaccessible = await member.client.from("products").select("id");
  ok(
    !inaccessible.error && !inaccessible.data.length,
    "RLS inmediata para sesión inactiva",
  );
  const deniedImage = await member.context.request.get(
    "http://localhost:3000/api/catalog-image/" + imageId,
  );
  ok(deniedImage.status() === 401, "Imagen bloqueada tras inactivación");
  await member.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(member.page).toHaveURL(/login/, { timeout: 15000 });
  const restored = await admin.client
    .from("profiles")
    .update({ status: "active" })
    .eq("id", member.id);
  ok(!restored.error, "Reactivación de Colaborador");
  memberDeactivated = false;
  await go(member, "/productos");
  await expect(
    member.page.getByRole("heading", { name: "Productos", exact: true }),
  ).toBeVisible();
  stage = "error de red";
  await go(member, "/clientes/" + clientId);
  await member.page
    .getByLabel("Notas", { exact: true })
    .fill("Formulario conservado ante fallo de red");
  await member.context.route("**/clientes/" + clientId, (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await member.page
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await expect(member.page.locator("main [role=alert]")).toContainText(
    "Revisa tu conexión",
  );
  await expect(member.page.getByLabel("Notas", { exact: true })).toHaveValue(
    "Formulario conservado ante fallo de red",
  );
  await member.context.unroute("**/clientes/" + clientId);
  ok(true, "Error de red en guardado conserva formulario y muestra mensaje");
  await member.context.setOffline(true);
  await member.page.goto("http://localhost:3000/clientes").catch(() => {});
  await member.context.setOffline(false);
  await go(member, "/clientes");
  await expect(
    member.page.getByRole("heading", { name: "Clientes", exact: true }),
  ).toBeVisible();
  ok(true, "Navegación se recupera tras desconexión");
  const audit = await admin.client
    .from("audit_log")
    .select("user_id,entity_type")
    .eq("entity_id", imageId);
  ok(
    audit.data?.some((x) => x.user_id === member.id),
    "Auditoría de imagen atribuida al Colaborador",
  );
  console.log("PASS: Fase2 real completada");
} catch (e) {
  console.error(
    "FAIL [" +
      stage +
      "]: " +
      (e instanceof Error
        ? e.message.split("\n").slice(0, 8).join(" ")
        : "Prueba fallida"),
  );
  process.exitCode = 1;
} finally {
  if (admin && member && memberDeactivated)
    await admin.client
      .from("profiles")
      .update({ status: "active" })
      .eq("id", member.id);
  if (admin)
    for (const [table, id] of records) {
      const values =
        table === "product_images"
          ? { is_active: false, is_main: false }
          : { is_active: false };
      const r = await admin.client.from(table).update(values).eq("id", id);
      if (r.error) {
        console.error("Pendiente desactivar registro de prueba de " + table);
        process.exitCode = 1;
      }
    }
  for (const s of sessions) await s.client.auth.signOut({ scope: "local" });
  await browser.close();
}
