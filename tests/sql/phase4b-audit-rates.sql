-- Estados de tasa sintéticos en PostgreSQL DEV: nunca persistir caché/fixtures.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and status='active' order by id limit 1),true);
-- Mover temporalmente fechas permite ausencia de referencia sin DELETE; ROLLBACK restaura todo.
update public.exchange_rates set rate_date=rate_date+1000000;
create function pg_temp.audit_adjust(p jsonb) returns uuid language plpgsql set search_path='' as $$declare m uuid:=gen_random_uuid();r uuid:=gen_random_uuid();begin
 insert into public.materials(id,code,name,category,unit) values(m,'AUDIT-FX-'||m,'Fixture FX 4B','Auditoría','gramos');
 perform public.inventory_operation(r,'adjustment_positive',jsonb_build_object('material_id',m,'quantity','1','reason','Auditoría FX 4B')||p,jsonb_build_object(m::text,'0'),'{}');return r;end $$;
do $$declare r uuid;d date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date;before_evidence jsonb;begin
 r:=pg_temp.audit_adjust('{"amount":"0.01","currency":"CRC"}');
 if not exists(select 1 from public.inventory_adjustment_cost_evidence where movement_id=r and amount_original=0.01 and amount_crc=0.01 and exchange_rate_applied is null) then raise exception 'CRC incorrecto';end if;
 begin perform pg_temp.audit_adjust('{"amount":"1","currency":"USD"}');raise exception 'Aceptó USD sin referencia' using errcode='ZX001';exception when sqlstate '22023' then null;end;
 insert into public.exchange_rates(source,rate_date,sell_rate) values('BCCR via tipodecambio.paginasweb.cr',d-1,500.123);
 r:=pg_temp.audit_adjust('{"amount":"1.25","currency":"USD"}');
 if not exists(select 1 from public.inventory_adjustment_cost_evidence where movement_id=r and exchange_rate_date=d-1 and rate_is_fallback and exchange_rate_applied=500.123 and amount_crc=625.15 and rate_origin='provider') then raise exception 'Fallback incorrecto';end if;
 select to_jsonb(e) into before_evidence from public.inventory_adjustment_cost_evidence e where movement_id=r;
 insert into public.exchange_rates(source,rate_date,sell_rate) values('BCCR via tipodecambio.paginasweb.cr',d,500.5);
 if (select to_jsonb(e) from public.inventory_adjustment_cost_evidence e where movement_id=r) is distinct from before_evidence then raise exception 'Referencia nueva alteró snapshot';end if;
 r:=pg_temp.audit_adjust('{"amount":"0.01","currency":"USD"}');
 if not exists(select 1 from public.inventory_adjustment_cost_evidence where movement_id=r and exchange_rate_date=d and not rate_is_fallback and exchange_rate_applied=500.5 and amount_crc=5.01) then raise exception 'Tasa actual HALF UP incorrecta';end if;
 insert into public.exchange_rates(source,rate_date,sell_rate) values('BCCR via tipodecambio.paginasweb.cr','1805-01-01',501.2345);
 r:=pg_temp.audit_adjust('{"amount":"1.25","currency":"USD","effective_at":"1805-01-01T12:00:00-06:00"}');
 if not exists(select 1 from public.inventory_adjustment_cost_evidence where movement_id=r and exchange_rate_date='1805-01-01' and not rate_is_fallback and amount_crc=626.54) then raise exception 'Histórico incorrecto';end if;
 begin perform pg_temp.audit_adjust('{"amount":"1","currency":"USD","effective_at":"1805-01-02T12:00:00-06:00"}');raise exception 'Aceptó histórico sin fecha exacta' using errcode='ZX001';exception when sqlstate '22023' then null;end;
 r:=pg_temp.audit_adjust('{"amount":"1.25","currency":"USD","effective_at":"1805-01-02T12:00:00-06:00","historical_rate":"501.2345","rate_source":"Evidencia sintética transaccional","rate_reason":"Auditoría de contrato histórico"}');
 if not exists(select 1 from public.inventory_adjustment_cost_evidence where movement_id=r and exchange_rate_date='1805-01-02' and rate_origin='admin_historical' and rate_provided_by=auth.uid() and rate_provided_at is not null and amount_crc=626.54) then raise exception 'Aporte histórico incorrecto';end if;
end $$;
set constraints all immediate;
rollback;
select 'PASS: CRC, sin referencia, fallback fechado, actual HALF UP, histórico exacto/faltante/aporte Admin, snapshot inmutable; caché restaurada' as result;
