-- Verificación de Fase 1 en el proyecto de desarrollo seleccionado.
-- Ejecutar todo el archivo en UNA conexión. Datos ficticios dentro de transacción;
-- ROLLBACK revierte las inserciones/actualizaciones de prueba. No borra datos reales.
begin;
select set_config('sigca.test_admin', gen_random_uuid()::text, true),
       set_config('sigca.test_member', gen_random_uuid()::text, true),
       set_config('sigca.test_inactive', gen_random_uuid()::text, true);

insert into auth.users(id, email, raw_user_meta_data)
values
  (current_setting('sigca.test_admin')::uuid, 'phase1-admin@example.invalid', '{"full_name":"Prueba transaccional"}'),
  (current_setting('sigca.test_member')::uuid, 'phase1-member@example.invalid', '{"role":"admin","status":"active"}'),
  (current_setting('sigca.test_inactive')::uuid, 'phase1-inactive@example.invalid', '{}');

do $$ begin
  if (select count(*) from public.profiles where id in (
    current_setting('sigca.test_admin')::uuid, current_setting('sigca.test_member')::uuid,
    current_setting('sigca.test_inactive')::uuid)) <> 3 then
    raise exception 'FAIL: trigger de creación de profiles';
  end if;
  if (select role from public.profiles where id=current_setting('sigca.test_member')::uuid) <> 'collaborator' then
    raise exception 'FAIL: metadata permitió elevar rol';
  end if;
end $$;

update public.profiles set role='admin' where id=current_setting('sigca.test_admin')::uuid;
update public.profiles set status='inactive' where id=current_setting('sigca.test_inactive')::uuid;

set local role anon;
do $$ begin
  begin
    perform 1 from public.profiles;
    raise exception 'FAIL: anon lee profiles';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_access();
    raise exception 'FAIL: anon ejecuta RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', current_setting('sigca.test_member'), true);
set local role authenticated;
do $$ declare changed integer; begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: aislamiento de perfil'; end if;
  if (select count(*) from public.audit_log) <> 0 then raise exception 'FAIL: colaborador lee auditoría'; end if;
  update public.profiles set role='admin' where id=auth.uid();
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: colaborador modifica rol'; end if;
  begin
    update public.profiles set full_name='Cambio no autorizado' where id=auth.uid();
    raise exception 'FAIL: privilegio de columna excesivo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.audit_log(action, entity_type) values('forged','profiles');
    raise exception 'FAIL: escritura de auditoría permitida';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_invitation('phase1-test@example.invalid');
    raise exception 'FAIL: colaborador autoriza invitación';
  exception when insufficient_privilege then null;
  end;
  perform public.record_access();
end $$;
reset role;

select set_config('request.jwt.claim.sub', current_setting('sigca.test_admin'), true);
set local role authenticated;
do $$ begin
  begin
    update public.profiles set role='collaborator' where id=auth.uid();
    raise exception 'FAIL: admin cambia su propio rol';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set role='admin' where id=current_setting('sigca.test_member')::uuid;
  if not exists(select 1 from public.audit_log where entity_id=current_setting('sigca.test_member')::uuid
    and user_id=auth.uid() and action='profile.updated' and metadata->'after'->>'role'='admin') then
    raise exception 'FAIL: auditoría del cambio de rol';
  end if;
  begin
    update public.audit_log set reason='Alteración no autorizada' where user_id=auth.uid();
    raise exception 'FAIL: auditoría editable';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set role='collaborator', status='inactive'
    where id=current_setting('sigca.test_member')::uuid;
  perform public.record_invitation('phase1-invited@example.invalid');
end $$;
reset role;

-- Identidad previamente activa: ya no puede operar tras inactivación.
select set_config('request.jwt.claim.sub', current_setting('sigca.test_member'), true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.profiles) <> 0 then raise exception 'FAIL: inactivo conserva lectura'; end if;
  begin
    perform public.record_access();
    raise exception 'FAIL: inactivo opera con identidad previa';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Sync de correo desde Auth, sin cambiar roles ni confiar en metadata.
update auth.users set email='phase1-updated@example.invalid'
  where id=current_setting('sigca.test_member')::uuid;
do $$ begin
  if (select email from public.profiles where id=current_setting('sigca.test_member')::uuid)
    <> 'phase1-updated@example.invalid' then raise exception 'FAIL: sync de correo'; end if;
end $$;

select 'PASS: creación de perfiles, metadata segura, anon, aislamiento, grants de columnas, no autoelevación, auditoría, RPC, inactivación y sync de correo; datos de prueba revertidos por ROLLBACK.' as result;
rollback;
