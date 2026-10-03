-- Fallo inducido DEV PostgreSQL; transacción completa revierte función/trigger.
-- No borrar ni reemplazar ninguna función/trigger existente.
begin;
create function pg_temp.phase4b_fail_audit() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'PHASE4B_INDUCED_AUDIT_FAILURE' using errcode='P0001';end $$;
create trigger phase4b_induced_audit_failure before insert on public.audit_log for each row execute function pg_temp.phase4b_fail_audit();
do $$
declare actor uuid;mat uuid;rev bigint;before_balance jsonb;after_balance jsonb;before_count bigint;after_count bigint;target uuid:=gen_random_uuid();
begin
 select id into strict actor from public.profiles where role='admin' and status='active' order by id limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select b.material_id,b.revision,to_jsonb(b) into strict mat,rev,before_balance from public.inventory_balances b join public.materials m on m.id=b.material_id join public.inventory_valuations v on v.material_id=b.material_id where m.name like 'VALIDACION-4B-%' and b.quantity_on_hand>1 and v.average_unit_cost_crc>1 order by b.material_id limit 1;
 select count(*) into before_count from public.inventory_movements where material_id=mat;
 begin
 perform public.inventory_operation(target,'adjustment_negative',jsonb_build_object('material_id',mat,'quantity','0.01','reason','Prueba inducida de rollback 4B'),jsonb_build_object(mat::text,rev::text),'{}');
 raise exception 'La auditoría no impidió la operación';
 exception when sqlstate 'P0001' then
 if sqlerrm<>'PHASE4B_INDUCED_AUDIT_FAILURE' then raise;end if;
 end;
 select to_jsonb(b) into after_balance from public.inventory_balances b where material_id=mat;
 select count(*) into after_count from public.inventory_movements where material_id=mat;
 if before_balance is distinct from after_balance or before_count<>after_count or exists(select 1 from public.inventory_movements where request_id=target) then raise exception 'Rollback incompleto';end if;
end $$;
rollback;
