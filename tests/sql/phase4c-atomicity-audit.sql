-- Controlled failures on DEV, isolated in a transaction. No fixture survives ROLLBACK.
begin;
set local lock_timeout='5s';
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and status='active' order by id limit 1),true);
update public.settings set hourly_rate=100.01;
create function pg_temp.fail_work_step() returns trigger language plpgsql as $$begin
 if current_setting('sigca.audit_failure',true)=tg_table_name
 and (tg_table_name<>'audit_log' or to_jsonb(new)->>'entity_type'='work_sessions') then
 raise exception 'INDUCED_WORK_STEP_FAILURE';end if;return new;end $$;
create trigger test_4c_session_failure after insert on public.work_sessions for each row execute function pg_temp.fail_work_step();
create trigger test_4c_pause_failure after insert on public.work_pauses for each row execute function pg_temp.fail_work_step();
create trigger test_4c_rate_failure after insert on public.work_session_rates for each row execute function pg_temp.fail_work_step();
create trigger test_4c_request_failure after insert on public.work_session_requests for each row execute function pg_temp.fail_work_step();
create trigger test_4c_event_failure after insert on public.audit_log for each row execute function pg_temp.fail_work_step();
do $$declare sid uuid;rid uuid;ord uuid;step text;baseline jsonb;afterward jsonb;begin
 select id into ord from public.orders where production_status='in_production' and notes like 'VALIDACION-4C-%' order by created_at desc limit 1;
 if ord is null then raise exception 'Missing 4C fixture';end if;
 foreach step in array array['work_sessions','work_pauses','work_session_rates','work_session_requests','audit_log'] loop
 sid:=gen_random_uuid();rid:=gen_random_uuid();
 select jsonb_build_array((select count(*) from public.work_sessions),(select count(*) from public.work_pauses),(select count(*) from public.work_session_rates),(select count(*) from public.work_session_requests),(select count(*) from public.audit_log)) into baseline;
 perform set_config('sigca.audit_failure',step,true);
 begin
 perform public.work_operate(rid,'start',sid,null,jsonb_build_object('order_id',ord));
 if step='work_pauses' then perform public.work_operate(gen_random_uuid(),'pause',sid,1,'{}');end if;
 raise exception 'Expected induced failure';
 exception when raise_exception then if sqlerrm<>'INDUCED_WORK_STEP_FAILURE' then raise;end if;end;
 select jsonb_build_array((select count(*) from public.work_sessions),(select count(*) from public.work_pauses),(select count(*) from public.work_session_rates),(select count(*) from public.work_session_requests),(select count(*) from public.audit_log)) into afterward;
 if baseline<>afterward or exists(select 1 from public.work_sessions where id=sid) then raise exception 'Partial write at %',step;end if;
 end loop;
end $$;
select 'PASS: five induced failures, zero partial session/pause/rate/request/audit writes' as result;
rollback;
