begin;

-- D-24: additive validation; preserve the existing settings constraint.
alter table public.settings add constraint settings_hourly_rate_4c_check check
 (hourly_rate is null or (hourly_rate>0 and hourly_rate<'Infinity'::numeric and scale(hourly_rate)<=2));

create table public.work_sessions (
 id uuid primary key, order_id uuid not null references public.orders(id),
 order_item_id uuid references public.order_items(id), user_id uuid not null references public.profiles(id),
 activity text check(length(activity)<=1000), status text not null check(status in ('running','paused','finished')),
 started_at timestamptz not null check(isfinite(started_at)), finished_at timestamptz check(isfinite(finished_at)),
 worked_seconds bigint check(worked_seconds>=0), revision bigint not null default 1 check(revision>0),
 source text not null check(source in ('timer','historical')),
 created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check((status='finished' and finished_at>=started_at and worked_seconds is not null) or
       (status in ('running','paused') and finished_at is null and worked_seconds is null)),
 check(source<>'historical' or (status='finished' and finished_at>started_at))
);
create unique index work_sessions_one_open on public.work_sessions(user_id) where status in ('running','paused');
create index work_sessions_order on public.work_sessions(order_id,started_at);
create index work_sessions_item on public.work_sessions(order_item_id);
create index work_sessions_worker on public.work_sessions(user_id,started_at);
create index work_sessions_creator on public.work_sessions(created_by);
create index work_sessions_editor on public.work_sessions(updated_by);
create table public.work_pauses (
 id uuid primary key default gen_random_uuid(), work_session_id uuid not null references public.work_sessions(id),
 paused_at timestamptz not null check(isfinite(paused_at)), resumed_at timestamptz check(isfinite(resumed_at)),
 created_at timestamptz not null default clock_timestamp(),
 check(resumed_at is null or resumed_at>=paused_at)
);
create index work_pauses_session on public.work_pauses(work_session_id);
create unique index work_pauses_one_open on public.work_pauses(work_session_id) where resumed_at is null;
create table public.work_session_rates (
 work_session_id uuid primary key references public.work_sessions(id),
 hourly_rate_applied numeric not null check(hourly_rate_applied>0 and hourly_rate_applied<'Infinity'::numeric and scale(hourly_rate_applied)<=2),
 currency text not null default 'CRC' check(currency='CRC'),
 source text not null check(source in ('settings','historical')),
 captured_by uuid not null references public.profiles(id), captured_at timestamptz not null default clock_timestamp()
);
create index work_session_rates_actor on public.work_session_rates(captured_by);
create table public.work_session_requests (
 id uuid primary key, actor_id uuid not null references public.profiles(id),
 work_session_id uuid not null references public.work_sessions(id), operation text not null,
 fingerprint text not null, resulting_revision bigint not null,
 created_at timestamptz not null default clock_timestamp()
);
create index work_session_requests_actor on public.work_session_requests(actor_id);
create index work_session_requests_session on public.work_session_requests(work_session_id);

alter table public.work_sessions enable row level security;
alter table public.work_pauses enable row level security;
alter table public.work_session_rates enable row level security;
alter table public.work_session_requests enable row level security;
revoke all on public.work_sessions,public.work_pauses,public.work_session_rates,public.work_session_requests from public,anon,authenticated,service_role;
grant select on public.work_sessions,public.work_pauses,public.work_session_rates,public.work_session_requests to authenticated;
create policy work_sessions_read on public.work_sessions for select to authenticated using(private.is_active());
create policy work_pauses_read on public.work_pauses for select to authenticated using(private.is_active());
create policy work_rates_admin on public.work_session_rates for select to authenticated using(private.is_admin());
create policy work_requests_read on public.work_session_requests for select to authenticated using(private.is_active() and (actor_id=(select auth.uid()) or private.is_admin()));

create function private.work_seconds(sid uuid,at_time timestamptz) returns bigint
language sql stable set search_path='' as $$
 select floor(extract(epoch from (coalesce(s.finished_at,at_time)-s.started_at))-
 coalesce((select sum(extract(epoch from (coalesce(p.resumed_at,at_time)-p.paused_at))) from public.work_pauses p where p.work_session_id=s.id),0))::bigint
 from public.work_sessions s where s.id=sid
$$;

create function private.work_validate(sid uuid) returns void language plpgsql set search_path='' as $$
declare s public.work_sessions;o public.orders;opened integer;now_at timestamptz:=clock_timestamp();
begin
 select * into s from public.work_sessions where id=sid;
 if not found then raise exception 'Sesión inexistente' using errcode='22023';end if;
 select * into o from public.orders where id=s.order_id;
 if o.confirmed_at is null or s.started_at<o.confirmed_at or s.started_at>now_at or s.finished_at>now_at
 or (o.production_status='delivered' and (s.finished_at is null or s.finished_at>o.delivered_at))
 or (o.production_status='cancelled' and (s.finished_at is null or s.finished_at>o.cancelled_at)) then
 raise exception 'Cronología de sesión incompatible con el pedido' using errcode='22023';end if;
 if s.order_item_id is not null and not exists(select 1 from public.order_items where id=s.order_item_id and order_id=s.order_id) then
 raise exception 'La línea no pertenece al pedido' using errcode='22023';end if;
 if s.status<>'finished' and o.production_status<>'in_production' then raise exception 'Sesión abierta fuera de producción' using errcode='PT409';end if;
 if exists(select 1 from public.work_sessions w where w.user_id=s.user_id and w.id<>s.id
 and tstzrange(w.started_at,w.finished_at,'[)') && tstzrange(s.started_at,s.finished_at,'[)')) then
 raise exception 'Existe una sesión solapada del trabajador' using errcode='PT409';end if;
 select count(*) into opened from public.work_pauses where work_session_id=s.id and resumed_at is null;
 if (s.status='paused' and opened<>1) or (s.status<>'paused' and opened<>0) then raise exception 'Estado y pausa incompatibles' using errcode='22023';end if;
 if exists(select 1 from public.work_pauses p where p.work_session_id=s.id and
 (p.paused_at<s.started_at or p.paused_at>coalesce(s.finished_at,now_at) or p.resumed_at>coalesce(s.finished_at,now_at)))
 or exists(select 1 from public.work_pauses a join public.work_pauses b on a.work_session_id=b.work_session_id and a.id<b.id
 where a.work_session_id=s.id and tstzrange(a.paused_at,a.resumed_at,'[)') && tstzrange(b.paused_at,b.resumed_at,'[)')) then
 raise exception 'Pausas fuera de intervalo o solapadas' using errcode='22023';end if;
 if not exists(select 1 from public.work_session_rates where work_session_id=s.id) then raise exception 'Falta snapshot de tarifa' using errcode='22023';end if;
 if s.status='finished' and s.worked_seconds is distinct from private.work_seconds(s.id,s.finished_at) then raise exception 'Duración inconsistente' using errcode='22023';end if;
end $$;

create function private.work_integrity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='work_sessions' then perform private.work_validate(new.id);
 elsif tg_op='DELETE' then perform private.work_validate(old.work_session_id);
 else perform private.work_validate(new.work_session_id);end if;
 return null;
end $$;
create constraint trigger work_session_integrity after insert or update on public.work_sessions deferrable initially deferred for each row execute function private.work_integrity();
create constraint trigger work_pause_integrity after insert or update or delete on public.work_pauses deferrable initially deferred for each row execute function private.work_integrity();

create function private.work_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or tg_table_name in ('work_session_rates','work_session_requests') then raise exception 'Evidencia inmutable' using errcode='42501';end if;
 if new.user_id is distinct from old.user_id or new.id<>old.id or new.created_at<>old.created_at or new.created_by<>old.created_by or new.source<>old.source then raise exception 'Identidad histórica inmutable' using errcode='42501';end if;
 return new;
end $$;
create trigger work_session_immutable before update or delete on public.work_sessions for each row execute function private.work_immutable();
create trigger work_rate_immutable before update or delete on public.work_session_rates for each row execute function private.work_immutable();
create trigger work_request_immutable before update or delete on public.work_session_requests for each row execute function private.work_immutable();

-- A trigger also covers all existing order RPC paths, without changing their signatures/grants.
create function private.work_order_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.production_status is distinct from old.production_status and old.production_status='in_production'
 and new.production_status in ('ready','cancelled','confirmed')
 and exists(select 1 from public.work_sessions where order_id=new.id and status in ('running','paused')) then
 raise exception 'Finaliza explícitamente las sesiones abiertas antes de cambiar el pedido' using errcode='PT409';end if;
 if exists(select 1 from public.work_sessions s where s.order_id=new.id and
 (new.confirmed_at is null or s.started_at<new.confirmed_at
 or (new.production_status='delivered' and (s.finished_at is null or s.finished_at>new.delivered_at))
 or (new.production_status='cancelled' and (s.finished_at is null or s.finished_at>new.cancelled_at)))) then
 raise exception 'La fecha del pedido invalidaría sesiones existentes' using errcode='PT409';end if;
 return new;
end $$;
create trigger work_order_guard before update on public.orders for each row execute function private.work_order_guard();

create function private.work_operate(request_id uuid,operation text,target uuid,expected_revision bigint,payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles;s public.work_sessions;prior public.work_sessions;o public.orders;req public.work_session_requests;
 worker uuid;ord uuid;oid uuid;t timestamptz;rate numeric;why text;finger text;before_data jsonb;after_data jsonb;p jsonb;
begin
 if request_id is null or target is null or operation is null or operation not in ('start','pause','resume','finish','historical','correct')
 or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Solicitud inválida' using errcode='22023';end if;
 if operation in ('start','historical') then worker:=case when operation='start' then auth.uid() else (payload->>'user_id')::uuid end;
 else select * into prior from public.work_sessions where id=target;worker:=prior.user_id;end if;
 -- All profile locks precede order locks, including the inactive worker of an Admin intervention.
 perform 1 from public.profiles where id in (auth.uid(),worker) order by id for share;
 select * into actor from public.profiles where id=auth.uid() and status='active';
 if not found then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if worker is null or not exists(select 1 from public.profiles where id=worker) then raise exception 'Trabajador inexistente' using errcode='22023';end if;
 if (operation in ('historical','correct') or worker<>actor.id) and actor.role<>'admin' then raise exception 'Operación exclusiva de Administración' using errcode='42501';end if;
 if worker<>actor.id and operation not in ('pause','finish','historical','correct') then raise exception 'Solo puedes operar tu propio cronómetro' using errcode='42501';end if;
 if operation in ('start','resume') and not exists(select 1 from public.profiles where id=worker and status='active') then raise exception 'Trabajador inactivo' using errcode='42501';end if;
 if (operation='start' and payload-array['order_id','order_item_id','activity']<>'{}'::jsonb)
 or (operation in ('pause','resume','finish') and payload-array['reason']<>'{}'::jsonb)
 or (operation='historical' and payload-array['order_id','order_item_id','user_id','activity','started_at','finished_at','pauses','hourly_rate','reason']<>'{}'::jsonb)
 or (operation='correct' and payload-array['order_id','order_item_id','activity','started_at','finished_at','pauses','reason']<>'{}'::jsonb) then raise exception 'Campos no permitidos' using errcode='22023';end if;
 why:=nullif(trim(payload->>'reason'),'');
 if operation in ('historical','correct') or worker<>actor.id then why:=private.order_reason(why);end if;
 finger:=md5(jsonb_build_object('operation',operation,'target',target,'revision',expected_revision,'payload',payload)::text);
 perform pg_advisory_xact_lock(hashtextextended('work-request:'||request_id::text,0));
 select * into req from public.work_session_requests where id=request_id;
 if found then
 if req.actor_id<>actor.id or req.fingerprint<>finger then raise exception 'UUID utilizado para otra solicitud' using errcode='PT409';end if;
 return req.work_session_id;end if;
 perform pg_advisory_xact_lock(hashtextextended('work-worker:'||worker::text,0));
 ord:=case when operation in ('start','historical') then (payload->>'order_id')::uuid else coalesce((payload->>'order_id')::uuid,prior.order_id) end;
 if ord is null then raise exception 'Pedido obligatorio' using errcode='22023';end if;
 for oid in select distinct x from unnest(array[ord,prior.order_id]) x where x is not null order by x loop
 select * into o from public.orders where id=oid for update;
 if not found then raise exception 'Pedido inexistente' using errcode='22023';end if;
 end loop;
 select * into o from public.orders where id=ord;
 if operation not in ('start','historical') then
 select * into s from public.work_sessions where id=target for update;
 if not found or s.revision is distinct from expected_revision or s.order_id is distinct from prior.order_id then raise exception 'La sesión cambió; recarga antes de continuar' using errcode='PT409';end if;
 perform 1 from public.work_pauses where work_session_id=target order by id for update;
 before_data:=jsonb_build_object('session',to_jsonb(s),'pauses',(select coalesce(jsonb_agg(to_jsonb(w) order by w.paused_at,w.id),'[]') from public.work_pauses w where work_session_id=target));
 elsif exists(select 1 from public.work_sessions where id=target) then raise exception 'Sesión ya registrada' using errcode='PT409';end if;
 if operation='start' then
 select hourly_rate into rate from public.settings where singleton for share;
 if rate is null or rate<=0 then raise exception 'Configura una tarifa válida antes de iniciar' using errcode='22023';end if;
 end if;
 t:=clock_timestamp();
 if operation in ('start','resume') and o.production_status<>'in_production' then raise exception 'Solo se inicia o reanuda en producción' using errcode='PT409';end if;
 if operation in ('start','historical') then
 if operation='historical' then
 if coalesce(payload->>'hourly_rate','')!~'^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Tarifa histórica inválida' using errcode='22023';end if;
 rate:=(payload->>'hourly_rate')::numeric;if rate<=0 then raise exception 'Tarifa histórica inválida' using errcode='22023';end if;end if;
 if exists(select 1 from public.work_sessions where user_id=worker and status<>'finished') and operation='start' then raise exception 'Ya existe una sesión abierta' using errcode='PT409';end if;
 insert into public.work_sessions(id,order_id,order_item_id,user_id,activity,status,started_at,finished_at,worked_seconds,source,created_by,updated_by)
 values(target,ord,(payload->>'order_item_id')::uuid,worker,nullif(trim(payload->>'activity'),''),case when operation='start' then 'running' else 'finished' end,
 case when operation='start' then t else (payload->>'started_at')::timestamptz end,case when operation='historical' then (payload->>'finished_at')::timestamptz end,
 case when operation='historical' then 0 end,case when operation='start' then 'timer' else 'historical' end,actor.id,actor.id);
 insert into public.work_session_rates(work_session_id,hourly_rate_applied,source,captured_by) values(target,rate,case when operation='start' then 'settings' else 'historical' end,actor.id);
 elsif operation='pause' then
 if s.status<>'running' then raise exception 'La sesión no está corriendo' using errcode='PT409';end if;
 insert into public.work_pauses(work_session_id,paused_at) values(target,t);
 update public.work_sessions set status='paused' where id=target;
 elsif operation='resume' then
 if s.status<>'paused' then raise exception 'La sesión no está pausada' using errcode='PT409';end if;
 update public.work_pauses set resumed_at=t where work_session_id=target and resumed_at is null;
 update public.work_sessions set status='running' where id=target;
 elsif operation='finish' then
 if s.status='finished' then raise exception 'La sesión ya finalizó' using errcode='PT409';end if;
 update public.work_pauses set resumed_at=t where work_session_id=target and resumed_at is null;
 update public.work_sessions set status='finished',finished_at=t,worked_seconds=private.work_seconds(target,t) where id=target;
 elsif operation='correct' then
 if s.status<>'finished' then raise exception 'Solo se corrige una sesión terminada' using errcode='PT409';end if;
 update public.work_sessions set order_id=ord,
 order_item_id=case when payload?'order_item_id' then (payload->>'order_item_id')::uuid else order_item_id end,
 activity=case when payload?'activity' then nullif(trim(payload->>'activity'),'') else activity end,
 started_at=case when payload?'started_at' then (payload->>'started_at')::timestamptz else started_at end,
 finished_at=case when payload?'finished_at' then (payload->>'finished_at')::timestamptz else finished_at end where id=target;
 end if;
 if operation in ('historical','correct') and payload?'pauses' then
 if jsonb_typeof(payload->'pauses')<>'array' then raise exception 'Pausas inválidas' using errcode='22023';end if;
 -- D-24 explicitly permits replacing pause intervals; the full prior set is retained in audit.
 if operation='correct' then delete from public.work_pauses where work_session_id=target;end if;
 for p in select value from jsonb_array_elements(payload->'pauses') loop
 if jsonb_typeof(p)<>'object' or p-array['paused_at','resumed_at']<>'{}'::jsonb or p->>'paused_at' is null or p->>'resumed_at' is null then raise exception 'Pausa histórica incompleta' using errcode='22023';end if;
 insert into public.work_pauses(work_session_id,paused_at,resumed_at) values(target,(p->>'paused_at')::timestamptz,(p->>'resumed_at')::timestamptz);
 end loop;end if;
 if operation in ('historical','correct') then update public.work_sessions set worked_seconds=private.work_seconds(target,t) where id=target;end if;
 if operation not in ('start','historical') then update public.work_sessions set revision=revision+1,updated_at=t,updated_by=actor.id where id=target;end if;
 perform private.work_validate(target);
 select * into s from public.work_sessions where id=target;
 after_data:=jsonb_build_object('session',to_jsonb(s),'pauses',(select coalesce(jsonb_agg(to_jsonb(w) order by w.paused_at,w.id),'[]') from public.work_pauses w where work_session_id=target));
 insert into public.work_session_requests(id,actor_id,work_session_id,operation,fingerprint,resulting_revision) values(request_id,actor.id,target,operation,finger,s.revision);
 insert into public.audit_log(user_id,action,entity_type,entity_id,reason,metadata)
 values(actor.id,'work_session.'||case when operation='finish' and worker<>actor.id then 'admin_finished' else operation end,'work_sessions',target,why,jsonb_build_object('before',before_data,'after',after_data));
 return target;
end $$;

create function public.work_operate(request_id uuid,operation text,target uuid,expected_revision bigint,payload jsonb)
returns uuid language sql security invoker set search_path='' as $$ select private.work_operate(request_id,operation,target,expected_revision,payload) $$;

create function private.work_read(target_order uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t timestamptz:=clock_timestamp();result jsonb;
begin
 if not private.is_active() then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 select jsonb_build_object('server_now',t,'can_start',exists(select 1 from public.settings where hourly_rate>0),
 'sessions',coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('worker_name',p.full_name,'elapsed_seconds',private.work_seconds(s.id,t),'pauses',
 (select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'paused_at',w.paused_at,'resumed_at',w.resumed_at) order by w.paused_at,w.id),'[]') from public.work_pauses w where w.work_session_id=s.id)) order by s.started_at desc),'[]')) into result
 from public.work_sessions s join public.profiles p on p.id=s.user_id
 where (target_order is not null and s.order_id=target_order) or (target_order is null and s.user_id=auth.uid() and s.status<>'finished');
 return result;
end $$;
create function public.work_read(target_order uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.work_read(target_order)$$;

revoke all on function private.work_seconds(uuid,timestamptz),private.work_validate(uuid),private.work_integrity(),private.work_immutable(),private.work_order_guard() from public,anon,authenticated,service_role;
revoke all on function private.work_operate(uuid,text,uuid,bigint,jsonb),public.work_operate(uuid,text,uuid,bigint,jsonb),private.work_read(uuid),public.work_read(uuid) from public,anon,authenticated,service_role;
grant execute on function private.work_operate(uuid,text,uuid,bigint,jsonb),public.work_operate(uuid,text,uuid,bigint,jsonb),private.work_read(uuid),public.work_read(uuid) to authenticated;
commit;
