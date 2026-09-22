-- Fase 2: atribuir sincronización de cotización al Administrador y revalidarlo en BD.
begin;
create function private.store_exchange_rate(actor uuid,source_date date,sell numeric)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=actor and role='admin' and status='active') then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if source_date>current_date+1 then raise exception 'Invalid rate date'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.exchange_rates(source,rate_date,sell_rate,fetched_at)
 values('BCCR via tipodecambio.paginasweb.cr',source_date,sell,now())
 on conflict(rate_date) do update set sell_rate=excluded.sell_rate,fetched_at=excluded.fetched_at;
end; $$;
create function public.store_exchange_rate(actor uuid,source_date date,sell numeric)
returns void language sql security invoker set search_path='' as $$
 select private.store_exchange_rate(actor,source_date,sell);
$$;
revoke all on function private.store_exchange_rate(uuid,date,numeric),public.store_exchange_rate(uuid,date,numeric)
 from public,anon,authenticated;
grant execute on function private.store_exchange_rate(uuid,date,numeric),public.store_exchange_rate(uuid,date,numeric) to service_role;
-- La aplicación usa el RPC, no escritura directa por service_role para esta tabla.
revoke insert,update on public.exchange_rates from service_role;
commit;
