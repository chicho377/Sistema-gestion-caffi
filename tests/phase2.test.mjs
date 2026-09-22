import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  parseRate,
  freshOrPrevious,
} from "../src/features/catalog/exchange-parser.ts";
import { validateFields, catalogs } from "../src/features/catalog/schema.ts";
import { normalizeImage } from "../src/features/catalog/image-validation.ts";
import sharp from "sharp";
test("Fase2: RLS, constraints, auditoría y RPC en PostgreSQL local", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated,anon;
 grant select,insert,update,delete on storage.objects to authenticated;`);
    for (const f of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
    const before = (
      await db.query("select count(*)::int as count from public.audit_log")
    ).rows;
    await db.exec(
      await readFile("tests/sql/phase2-remote-verification.sql", "utf8"),
    );
    assert.deepEqual(
      (await db.query("select count(*)::int as count from public.audit_log"))
        .rows,
      before,
    );
  } finally {
    await db.close();
  }
});
test("Tasa: fuente, fecha y valores inválidos no reemplazan la última tasa", () => {
  assert.deepEqual(
    parseRate({ venta: 450, fecha: "22/09/2026" }, new Date("2026-09-22")),
    {
      source: "BCCR via tipodecambio.paginasweb.cr",
      sell_rate: 450,
      rate_date: "2026-09-22",
    },
  );
  for (const value of [
    { venta: 0, fecha: "22/09/2026" },
    { venta: -2, fecha: "22/09/2026" },
    { venta: Infinity, fecha: "22/09/2026" },
    { venta: 450, fecha: "31/02/2026" },
    { venta: 450, fecha: "31/12/2099" },
    { venta: "450", fecha: "22/09/2026" },
  ])
    assert.throws(() => parseRate(value));
});
test("Tasa guardada sobrevive caída, respuesta inválida y respuesta anterior", async () => {
  const previous = {
    source: "BCCR via tipodecambio.paginasweb.cr",
    rate_date: "2026-09-22",
    sell_rate: 450,
    fetched_at: "2026-09-22T12:00:00Z",
  };
  for (const load of [
    async () => {
      throw Error("offline");
    },
    async () => ({ venta: 0, fecha: "22/09/2026" }),
    async () => ({ venta: 449, fecha: "21/09/2026" }),
  ]) {
    assert.deepEqual(await freshOrPrevious(previous, load), {
      ...previous,
      cached: true,
    });
  }
  assert.equal(
    await freshOrPrevious(null, async () => {
      throw Error("offline");
    }),
    null,
  );
});
test("Validación servidor: teléfono, correo y valores numéricos", () => {
  const f = new FormData();
  f.set("name", "Cliente");
  f.set("phone", "83639663");
  f.set("email", "invalid");
  assert.throws(() => validateFields(catalogs.clientes.fields, f));
  f.set("email", "valid@example.test");
  assert.equal(validateFields(catalogs.clientes.fields, f).phone, "83639663");
  const p = new FormData();
  p.set("sku", "A");
  p.set("name", "B");
  p.set("base_price", "NaN");
  assert.throws(() => validateFields(catalogs.productos.fields, p));
});
test("Imágenes: bytes y MIME, límite, SVG y archivo disfrazado", async () => {
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#DD0675" },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await sharp(await normalizeImage(png, "image/png")).metadata()).format,
    "webp",
  );
  await assert.rejects(normalizeImage(png, "image/jpeg"));
  await assert.rejects(normalizeImage(Buffer.from("<svg></svg>"), "image/png"));
  await assert.rejects(
    normalizeImage(Buffer.from("not an image"), "image/png"),
  );
  await assert.rejects(
    normalizeImage(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"),
  );
});
