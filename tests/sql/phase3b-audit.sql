begin;
insert into auth.users(id,email) values
 ('71000000-0000-4000-8000-000000000001','audit3b-admin@example.test'),
 ('71000000-0000-4000-8000-000000000002','audit3b-member@example.test'),
 ('71000000-0000-4000-8000-000000000003','audit3b-admin2@example.test');
update public.profiles set role='admin' where id in ('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003');
create function pg_temp.expect_code(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;exception when others then if sqlstate<>expected then raise;end if;return;end;
 raise exception 'Operación inválida aceptada: %',statement;
end $$;
create function pg_temp.document(amount text) returns jsonb language sql as $$
 select jsonb_build_object('client_id','72000000-0000-4000-8000-000000000001','order_date',(clock_timestamp() at time zone 'America/Costa_Rica')::date,'requested_delivery_date',(clock_timestamp() at time zone 'America/Costa_Rica')::date+8,'discount_amount','0','notes','AUDITORIA3B','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'product_name_snapshot','Artesanía','quantity','1','unit_price',amount,'discount_amount','0','is_active',true)))
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
insert into public.clients(id,name) values('72000000-0000-4000-8000-000000000001','AUDITORIA3B');
do $$
declare o uuid:=gen_random_uuid();rev integer; p uuid; doc jsonb; before_order public.orders; after_order public.orders; zero_evidence jsonb; states text[]:=array['quote','confirmed','in_production','ready','delivered','cancelled'];src text;dest text;actor uuid;permitted boolean;code text;
begin
 doc:=pg_temp.document('0');perform public.save_quote(o,0,doc);perform public.confirm_order(o,1,'{"zero_reason":"Autorización original"}');
 select * into before_order from public.orders where id=o;
 zero_evidence:=jsonb_build_object('by',before_order.zero_total_authorized_by,'at',before_order.zero_total_authorized_at,'reason',before_order.zero_total_reason,'revision',before_order.zero_total_authorized_revision);
 perform set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
 perform public.correct_order_dates(o,2,jsonb_build_object('confirmed_at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'reason','Segundo Admin corrige hora'));
 perform public.amend_order(o,3,doc||'{"notes":"Cambio no comercial por otro Admin"}');
 select * into after_order from public.orders where id=o;
 if jsonb_build_object('by',after_order.zero_total_authorized_by,'at',after_order.zero_total_authorized_at,'reason',after_order.zero_total_reason,'revision',after_order.zero_total_authorized_revision)<>zero_evidence then raise exception 'Autorizador original sustituido';end if;
 perform public.transition_order(o,4,'{"state":"cancelled","reason":"Conservar autorización"}');
 if not exists(select 1 from public.orders where id=o and zero_total_authorized_by=before_order.zero_total_authorized_by and zero_total_authorized_at=before_order.zero_total_authorized_at and zero_total_reason=before_order.zero_total_reason) then raise exception 'Cancelación borra evidencia cero';end if;
 if exists(select 1 from public.payments where order_id=o) then raise exception 'Pago ficticio cero';end if;
 -- Evidencia anterior permanece incluso tras una nueva autorización de composición comercial.
 o:=gen_random_uuid();doc:=pg_temp.document('0');perform set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
 perform public.save_quote(o,0,doc);perform public.confirm_order(o,1,'{"zero_reason":"Original A"}');
 perform set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
 perform public.amend_order(o,2,jsonb_set(doc,'{items,0,quantity}','"2"')||'{"zero_reason":"Nueva composición B"}');
 if (select count(*) from public.order_history(o) where action='order.zero_authorized')<>2 then raise exception 'Autorización original perdida del historial';end if;
 -- Contrato HTTP: entrada inválida no es conflicto de revisión.
 perform pg_temp.expect_code(format('select public.transition_order(%L,3,%L)',o,'{}'),'22023');
 perform pg_temp.expect_code(format('select public.transition_order(%L,3,%L)',o,'{"state":"inventado"}'),'22023');
 perform pg_temp.expect_code(format('select public.register_payment(%L,null,%L)',o,'{"amount":"1","payment_method":"cash"}'),'22023');
 perform pg_temp.expect_code(format('select public.transition_order(%L,0,%L)',o,'{"state":"ready"}'),'22023');
 perform pg_temp.expect_code(format('select public.amend_order(%L,-1,%L)',o,doc),'22023');
 perform pg_temp.expect_code(format('select public.void_payment(%L,3,%L)',o,'{"reason":"Falta pago"}'),'22023');
 perform pg_temp.expect_code(format('select public.void_payment(%L,3,%L)',o,jsonb_build_object('reason','Ajeno/inexistente','payment_id',gen_random_uuid())),'22023');
 perform pg_temp.expect_code(format('select public.transition_order(%L,2,%L)',o,'{"state":"in_production"}'),'PT409');
 -- Tipo, método, actor, cliente, notas, referencia e inmutabilidad.
 o:=gen_random_uuid();doc:=pg_temp.document('10');perform public.save_quote(o,0,doc);
 perform pg_temp.expect_code(format('select public.confirm_order(%L,1,%L)',o,'{"order_number":"PED-2026-99999"}'),'22023');
 perform pg_temp.expect_code(format('select public.confirm_order(%L,1,%L)',o,'{"total":"1"}'),'22023');
 perform public.confirm_order(o,1,'{"deposit_percentage":"50"}');
 perform pg_temp.expect_code(format('select public.register_payment(%L,2,%L)',o,'{"amount":"1","payment_method":"cash","currency":"USD"}'),'22023');
 perform pg_temp.expect_code(format('select public.register_payment(%L,2,%L)',o,'{"amount":"1","payment_method":"cash","payment_date":"2099-01-01T00:00:00-06:00"}'),'22023');
 p:=public.register_payment(o,2,'{"amount":"1.20","payment_method":"sinpe_movil","payment_type":"Adelanto","reference":"TEST","notes":"Auditoría"}');
 if not exists(select 1 from public.payments where id=p and amount=1.20 and currency='CRC' and client_id='72000000-0000-4000-8000-000000000001' and created_by=auth.uid() and payment_type='Adelanto' and reference='TEST' and notes='Auditoría' and payment_date>=before_order.confirmed_at) then raise exception 'Registro incompleto';end if;
 perform public.void_payment(o,3,jsonb_build_object('payment_id',p,'reason','Corrección'));
 if not exists(select 1 from public.payments where id=p and status='voided' and voided_by=auth.uid() and voided_at is not null and void_reason='Corrección' and amount=1.20 and payment_type='Adelanto') then raise exception 'Anulación incompleta';end if;
 perform public.amend_order(o,4,jsonb_set(doc,'{items,0,unit_price}','"2"'));
 if not exists(select 1 from public.orders where id=o and deposit_percentage_applied=50 and deposit_required_amount=5) then raise exception 'Adelanto reescrito tras reducir total';end if;
 if not exists(select 1 from public.order_payment_summary where order_id=o and operational_deposit_required::numeric=2 and financial_status='no_deposit') then raise exception 'Mínimo operativo incorrecto';end if;
 perform public.register_payment(o,5,'{"amount":"2","payment_method":"cash"}');perform public.transition_order(o,6,'{"state":"in_production"}');
 -- Matriz completa, 36 pares por rol. Cada transición examinada revierte en subtransacción.
 foreach actor in array array['71000000-0000-4000-8000-000000000001'::uuid,'71000000-0000-4000-8000-000000000002'::uuid] loop
 foreach src in array states loop foreach dest in array states loop
 perform set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
 o:=gen_random_uuid();perform public.save_quote(o,0,pg_temp.document('10'));
 if src<>'quote' then perform public.confirm_order(o,1,'{"deposit_percentage":"0"}');end if;
 if src in ('in_production','ready','delivered') then perform public.transition_order(o,2,'{"state":"in_production"}');end if;
 if src in ('ready','delivered') then perform public.transition_order(o,3,'{"state":"ready"}');end if;
 if src='delivered' then perform public.transition_order(o,4,'{"state":"delivered"}');end if;
 if src='cancelled' then perform public.transition_order(o,2,'{"state":"cancelled","reason":"Fixture"}');end if;
 select revision into rev from public.orders where id=o;
 permitted:=(src='quote' and dest in ('confirmed','cancelled')) or (src='confirmed' and dest='in_production') or (src='in_production' and dest='ready') or (src='ready' and dest='delivered') or (actor='71000000-0000-4000-8000-000000000001' and ((src in ('confirmed','in_production','ready') and dest='cancelled') or (src='in_production' and dest='confirmed') or (src='ready' and dest='in_production') or (src='delivered' and dest='ready')));
 perform set_config('request.jwt.claim.sub',actor::text,true);
 begin
 if src='quote' and dest='confirmed' then perform public.confirm_order(o,rev,'{}');else perform public.transition_order(o,rev,jsonb_build_object('state',dest,'reason','Prueba de matriz'));end if;
 if not permitted then raise exception 'Transición no autorizada aceptada: % % %',src,dest,actor;end if;
 if not exists(select 1 from public.orders where id=o and production_status=dest and updated_by=actor and revision=rev+1) then raise exception 'Estado/actor/revisión incoherentes';end if;
 raise exception using errcode='ZZ001';
 exception when sqlstate 'ZZ001' then null;when insufficient_privilege or sqlstate 'PT409' then
 get stacked diagnostics code=returned_sqlstate;
 if permitted or (src='cancelled' and code<>'PT409') or (src<>'cancelled' and code<>'42501') then raise exception 'Rechazo incorrecto % → %, %',src,dest,code;end if;
 end;
 if (select production_status from public.orders where id=o)<>src then raise exception 'Prueba no revierte estado';end if;
 end loop;end loop;end loop;
 -- Trazabilidad: eventos explícitos y snapshots before/after separados, mismo actor/pedido.
 perform set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
 o:=gen_random_uuid();doc:=pg_temp.document('10');perform public.save_quote(o,0,doc);
 perform public.confirm_order(o,1,'{"deposit_percentage":"50"}');
 insert into public.clients(id,name) values('72000000-0000-4000-8000-000000000002','Segundo cliente auditoría');
 doc:=doc||'{"client_id":"72000000-0000-4000-8000-000000000002","reason":"Cambio autorizado"}';
 perform public.amend_order(o,2,doc);
 doc:=jsonb_set(doc,'{items,0,unit_price}','"11"');perform public.amend_order(o,3,doc);
 p:=public.register_payment(o,4,'{"amount":"1","payment_method":"cash"}');
 perform public.transition_order(o,5,'{"state":"in_production","reason":"Excepción con adelanto pendiente"}');
 perform public.transition_order(o,6,'{"state":"ready"}');
 perform public.transition_order(o,7,'{"state":"in_production","reason":"Retroceso motivado"}');
 perform public.transition_order(o,8,'{"state":"ready"}');perform public.transition_order(o,9,'{"state":"delivered"}');
 perform public.transition_order(o,10,'{"state":"ready","reason":"Reapertura"}');perform public.transition_order(o,11,'{"state":"delivered"}');
 perform public.transition_order(o,12,'{"state":"ready","reason":"Reapertura para cancelar"}');
 perform public.void_payment(o,13,jsonb_build_object('payment_id',p,'reason','Anulación motivada'));
 perform public.transition_order(o,14,'{"state":"cancelled","reason":"Cierre auditado"}');
 foreach src in array array['confirmed','deposit_override','client_changed','financial_changed','payment_recorded','production_override','transitioned','reversed','delivered','reopened','payment_voided','cancelled'] loop
 if not exists(select 1 from public.audit_log where entity_id=o and action='order.'||src and user_id=auth.uid() and created_at is not null) then raise exception 'Falta evento/actor/fecha %',src;end if;
 end loop;
 if (select count(*) from public.audit_log where entity_id=o and action='order.delivered')<>2 then raise exception 'Reentrega pierde historia';end if;
 if exists(select 1 from public.audit_log where entity_id in (o,p) and action in ('orders.update','payments.update') and (metadata->'before' is null or metadata->'after' is null or user_id is null)) then raise exception 'Snapshot de auditoría incompleto';end if;
 if not exists(select 1 from public.audit_log where entity_id=o and action='orders.update' and metadata->'before'->>'production_status'='quote' and metadata->'after'->>'order_number' like 'PED-%' and metadata->'after'->>'deposit_required_amount'='5.00') then raise exception 'No se audita número/adelanto';end if;
end $$;
rollback;
select 'PASS auditoría 3B: 72 transiciones, cero entre Admin distintos, contrato de errores, metadatos de pagos' as result;
