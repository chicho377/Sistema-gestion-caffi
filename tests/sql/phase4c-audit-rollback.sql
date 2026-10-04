-- DEV: induced failure, fully rolled back including test tariff and trigger.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and status='active' order by id limit 1),true);
update public.settings set hourly_rate=100.01;
create function pg_temp.fail_work_audit() returns trigger language plpgsql as $$begin
 if new.entity_type='work_sessions' then raise exception 'INDUCED_WORK_AUDIT_FAILURE';end if;return new;end $$;
create trigger test_work_audit_failure before insert on public.audit_log for each row execute function pg_temp.fail_work_audit();
do $$declare sid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();ord uuid;begin
 select id into ord from public.orders where production_status='in_production' and notes like 'VALIDACION-4C-%' order by created_at desc limit 1;
 if ord is null then raise exception 'Missing 4C fixture';end if;
 begin
 perform private.work_operate(rid,'start',sid,null,jsonb_build_object('order_id',ord));
 raise exception 'Expected induced failure';
 exception when raise_exception then if sqlerrm<>'INDUCED_WORK_AUDIT_FAILURE' then raise;end if;end;
 if exists(select 1 from public.work_sessions where id=sid) or exists(select 1 from public.work_session_rates where work_session_id=sid) or exists(select 1 from public.work_session_requests where id=rid) then raise exception 'Partial write';end if;
end $$;
select 'PASS: induced audit failure rolls back session, tariff and idempotency' as result;
rollback;
