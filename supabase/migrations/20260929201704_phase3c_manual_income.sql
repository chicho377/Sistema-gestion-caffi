-- Solo Fase 3C. No modifica pedidos, pagos, contadores ni historial existente.
begin;
create table public.manual_income (
 id uuid primary key,
 amount public.quote_money not null check(amount>0),
 currency text not null default 'CRC' check(currency='CRC'),
 income_date timestamptz not null check(isfinite(income_date)),
 income_type text check(income_type in ('product_sale','cards','stickers','other')),
 payment_method text check(payment_method in ('cash','sinpe_movil','transfer','card','other')),
 description text check(length(description)<=3000),
 is_historical boolean not null,
 status text not null default 'valid' check(status in ('valid','voided')),
 created_by uuid not null references public.profiles(id) on delete restrict,
 voided_by uuid references public.profiles(id) on delete restrict,
 voided_at timestamptz, void_reason text,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 constraint manual_income_chronology check(isfinite(created_at) and isfinite(updated_at) and income_date<=created_at and updated_at>=created_at),
 constraint manual_income_void_evidence check((case when status='valid' then voided_by is null and voided_at is null and void_reason is null else voided_by is not null and voided_at is not null and isfinite(voided_at) and voided_at>=created_at and void_reason is not null and length(trim(void_reason)) between 1 and 1000 end) is true)
);
create index manual_income_date_status_idx on public.manual_income(income_date desc,status,id);
create index manual_income_creator_idx on public.manual_income(created_by);
create index manual_income_voider_idx on public.manual_income(voided_by);
alter table public.manual_income enable row level security;
revoke all on public.manual_income from public,anon,authenticated,service_role;
grant select on public.manual_income to authenticated;
create policy manual_income_admin_read on public.manual_income for select to authenticated using ((select private.is_admin()));

create function private.guard_manual_income() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'No se permite borrar ingresos' using errcode='42501'; end if;
 if not private.is_admin() then raise exception 'Solo Administración activa' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if new.created_by is distinct from auth.uid() or new.status<>'valid' or new.income_date>clock_timestamp() then raise exception 'Ingreso no autorizado' using errcode='42501'; end if;
  new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
  new.is_historical:=(new.income_date at time zone 'America/Costa_Rica')::date<(new.created_at at time zone 'America/Costa_Rica')::date;
 else
  if (to_jsonb(new)-array['status','voided_by','voided_at','void_reason','updated_at']) is distinct from (to_jsonb(old)-array['status','voided_by','voided_at','void_reason','updated_at']) or old.status<>'valid' or new.status<>'voided' or new.voided_by is distinct from auth.uid() then
   raise exception 'Ingreso inmutable; corregir mediante anulación' using errcode='42501';
  end if;
  new.voided_at:=clock_timestamp();new.updated_at:=new.voided_at;
 end if;
 return new;
end $$;
create trigger manual_income_guard before insert or update or delete on public.manual_income for each row execute function private.guard_manual_income();
create function private.audit_manual_income() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(user_id,action,entity_type,entity_id,reason,metadata)
 values(auth.uid(),case when tg_op='INSERT' then 'manual_income.created' else 'manual_income.voided' end,'manual_income',new.id,new.void_reason,
 jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;
create trigger manual_income_audit after insert or update on public.manual_income for each row execute function private.audit_manual_income();

create function private.register_manual_income(target uuid,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v numeric;t timestamptz;
begin
 perform 1 from public.profiles where id=auth.uid() and status='active' and role='admin' for share;
 if not found then raise exception 'Solo Administración activa' using errcode='42501'; end if;
 if target is null or payload is null or jsonb_typeof(payload)<>'object' or payload-array['amount','currency','income_date','income_type','payment_method','description']<>'{}'::jsonb then raise exception 'Datos de ingreso inválidos' using errcode='22023'; end if;
 if jsonb_typeof(payload->'amount') is distinct from 'string' then raise exception 'Envía el importe como texto decimal' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each(payload) e where e.key<>'amount' and jsonb_typeof(e.value) not in ('string','null')) then raise exception 'Campos de texto inválidos' using errcode='22023'; end if;
 v:=private.quote_input_money(payload->>'amount');
 if v<=0 or coalesce(payload->>'currency','CRC')<>'CRC' then raise exception 'Monto positivo en CRC requerido' using errcode='22023'; end if;
 t:=private.order_effective_at(payload->>'income_date');
 if nullif(payload->>'income_type','') is not null and payload->>'income_type' not in ('product_sale','cards','stickers','other') then raise exception 'Clasificación inválida' using errcode='22023'; end if;
 if nullif(payload->>'payment_method','') is not null and payload->>'payment_method' not in ('cash','sinpe_movil','transfer','card','other') then raise exception 'Método inválido' using errcode='22023'; end if;
 if length(payload->>'description')>3000 then raise exception 'Descripción demasiado larga' using errcode='22023'; end if;
 insert into public.manual_income(id,amount,income_date,income_type,payment_method,description,created_by,is_historical)
 values(target,v,t,nullif(payload->>'income_type',''),nullif(payload->>'payment_method',''),nullif(trim(payload->>'description'),''),auth.uid(),false);
 return target;
exception when unique_violation then raise exception 'Este ingreso ya fue registrado. Consulta su detalle antes de reintentar.' using errcode='PT409';
end $$;
create function private.void_manual_income(target uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare v public.manual_income; why text;
begin
 perform 1 from public.profiles where id=auth.uid() and status='active' and role='admin' for share;
 if not found then raise exception 'Solo Administración activa' using errcode='42501'; end if;
 why:=private.order_reason(reason);
 select * into v from public.manual_income where id=target for update;
 if not found or v.status<>'valid' then raise exception 'El ingreso no está vigente. Recarga antes de continuar.' using errcode='PT409'; end if;
 update public.manual_income set status='voided',voided_by=auth.uid(),voided_at=clock_timestamp(),void_reason=why where id=target;
end $$;
create function public.register_manual_income(target uuid,payload jsonb) returns uuid language sql security invoker set search_path='' as $$select private.register_manual_income(target,payload)$$;
create function public.void_manual_income(target uuid,reason text) returns void language sql security invoker set search_path='' as $$select private.void_manual_income(target,reason)$$;
revoke all on function private.guard_manual_income(),private.audit_manual_income(),private.register_manual_income(uuid,jsonb),private.void_manual_income(uuid,text),public.register_manual_income(uuid,jsonb),public.void_manual_income(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.register_manual_income(uuid,jsonb),private.void_manual_income(uuid,text),public.register_manual_income(uuid,jsonb),public.void_manual_income(uuid,text) to authenticated;
create view public.manual_income_read with(security_invoker=true) as
 select id,amount::text,currency,income_date,income_type,payment_method,description,is_historical,status,created_by,voided_by,voided_at,void_reason,created_at,updated_at from public.manual_income;
revoke all on public.manual_income_read from public,anon,authenticated,service_role;
grant select on public.manual_income_read to authenticated;
commit;
