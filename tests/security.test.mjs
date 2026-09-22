import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Migración: autorización real PostgreSQL, perfiles seguros y auditoría", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  for (const file of (await readdir("supabase/migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  const admin = "00000000-0000-4000-8000-000000000001";
  const member = "00000000-0000-4000-8000-000000000002";
  const inactive = "00000000-0000-4000-8000-000000000003";
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
    ('${admin}','admin@example.test','{"full_name":"Administradora"}'),
    ('${member}','member@example.test','{"role":"admin","status":"active"}'),
    ('${inactive}','inactive@example.test','{}');
    update public.profiles set role='admin' where id='${admin}';
    update public.profiles set status='inactive' where id='${inactive}';`);
  const as = async (id, role = "authenticated") => {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`,
    );
  };
  await t.test(
    "metadata no eleva privilegios; colaborador solo lee su perfil",
    async () => {
      await as(member);
      const { rows } = await db.query("select id,role from public.profiles");
      assert.deepEqual(rows, [{ id: member, role: "collaborator" }]);
      assert.equal(
        (await db.query("select * from public.audit_log")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            `update public.profiles set role='admin' where id='${member}' returning id`,
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.exec("select public.record_invitation('x@example.test')"),
        /Forbidden/,
      );
    },
  );
  await t.test(
    "anon sin lecturas, escrituras ni RPC; auditoría no falsificable",
    async () => {
      await as("", "anon");
      await assert.rejects(
        db.exec("select * from public.profiles"),
        /permission denied/,
      );
      await assert.rejects(
        db.exec("select public.record_access()"),
        /permission denied/,
      );
      await as(member);
      await assert.rejects(
        db.exec(
          "insert into public.audit_log(action,entity_type) values('fake','profiles')",
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.exec(
          `update public.profiles set full_name='hacked' where id='${member}'`,
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.exec("delete from public.profiles"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "admin cambia otro usuario pero nunca su propio rol; auditoría guarda actor",
    async () => {
      await as(admin);
      assert.equal(
        (await db.query("select id from public.profiles")).rows.length,
        3,
      );
      await assert.rejects(
        db.exec(
          `update public.profiles set role='collaborator' where id='${admin}'`,
        ),
        /own role/,
      );
      await db.exec(
        `update public.profiles set role='admin' where id='${member}'`,
      );
      const { rows } = await db.query(
        `select user_id, metadata from public.audit_log where entity_id='${member}' and action='profile.updated'`,
      );
      assert.equal(rows.at(-1).user_id, admin);
      assert.equal(rows.at(-1).metadata.after.role, "admin");
      await assert.rejects(
        db.exec("update public.audit_log set action='altered'"),
        /permission denied/,
      );
      await assert.rejects(
        db.exec("delete from public.audit_log"),
        /permission denied/,
      );
      await db.exec(
        `update public.profiles set role='collaborator' where id='${member}'`,
      );
    },
  );
  await t.test(
    "inactivar bloquea una identidad previamente autenticada",
    async () => {
      await as(member);
      await db.exec("select public.record_access()");
      await as(admin);
      await db.exec(
        `update public.profiles set status='inactive' where id='${member}'`,
      );
      await as(member);
      assert.equal(
        (await db.query("select * from public.profiles")).rows.length,
        0,
      );
      await assert.rejects(
        db.exec("select public.record_access()"),
        /Forbidden/,
      );
      await assert.rejects(
        db.exec("select public.record_invitation('x@example.test')"),
        /Forbidden/,
      );
      await as(inactive);
      assert.equal(
        (await db.query("select * from public.profiles")).rows.length,
        0,
      );
    },
  );
  await t.test(
    "invitación registra intención atribuida, RPC no admite actor suministrado",
    async () => {
      await as(admin);
      await db.exec("select public.record_invitation('new@example.test')");
      const { rows } = await db.query(
        "select user_id,action from public.audit_log where action='user.invitation_requested'",
      );
      assert.equal(rows[0].user_id, admin);
    },
  );
  await t.test("script remoto se ejecuta y revierte sin alterar datos previos", async () => {
    await as("");
    await db.exec("reset role");
    const counts = async () => (await db.query("select (select count(*) from auth.users) as users, (select count(*) from public.profiles) as profiles, (select count(*) from public.audit_log) as audit")).rows;
    const before = await counts();
    await db.exec(await readFile("tests/sql/phase1-remote-verification.sql", "utf8"));
    assert.deepEqual(await counts(), before);
  });
  await db.close();
});
