begin;
insert into auth.users(id,email) values('61000000-0000-4000-8000-000000000001','phase3b-admin@example.test'),('61000000-0000-4000-8000-000000000002','phase3b-member@example.test');
update public.profiles set role='admin' where id='61000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
insert into public.clients(id,name) values('62000000-0000-4000-8000-000000000001','3B Cliente'),('62000000-0000-4000-8000-000000000002','3B Otro');
update public.settings set deposit_percentage=50;
do $$
declare oid uuid:='64000000-0000-4000-8000-000000000001'; oid2 uuid:='64000000-0000-4000-8000-000000000002'; doc jsonb; rev integer; pid uuid; total_paid numeric; day date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date; before_counter bigint; old_number text; v text; fixed timestamptz;
begin
 doc:=jsonb_build_object('client_id','62000000-0000-4000-8000-000000000001','order_date',day,'requested_delivery_date',day+8,'discount_amount','0','notes','3B prueba','items',jsonb_build_array(jsonb_build_object('id','65000000-0000-4000-8000-000000000001','product_name_snapshot','Encargo','quantity','1','unit_price','1.00','discount_amount','0','is_active',true)));
 perform public.save_quote(oid,0,doc);
 perform public.save_quote('64000000-0000-4000-8000-000000000098',0,jsonb_set(doc,'{items}','[]'));
 begin perform public.confirm_order('64000000-0000-4000-8000-000000000098',1,'{"zero_reason":"No basta"}');raise exception 'Confirma sin líneas';exception when invalid_parameter_value then null;end;
 begin perform public.confirm_order(oid,1,'{"confirmed_at":"2099-01-01T00:00:00-06:00"}');raise exception 'Confirma en futuro';exception when invalid_parameter_value then null;end;
 -- Anterior a confirmar: no pagos, no sobreescala porcentual y sin consumir consecutivo en fallos.
 begin perform public.register_payment(oid,1,'{"amount":"1","payment_method":"cash"}');raise exception 'Pago en quote';exception when insufficient_privilege then null;end;

 -- El contador es deliberadamente inaccesible a authenticated; comprobación por rol propietario fuera de este bloque.
end $$;
reset role;
-- Bloque siguiente usa los RPC con identidad colaborador/admin, sin consultar contador restringido.
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
do $$
declare oid uuid:='64000000-0000-4000-8000-000000000001'; oid2 uuid:='64000000-0000-4000-8000-000000000002'; doc jsonb; rev integer; pid uuid; day date:=(clock_timestamp() at time zone 'America/Costa_Rica')::date; old_number text; v text; fixed timestamptz;
begin
 doc:=jsonb_build_object('client_id','62000000-0000-4000-8000-000000000001','order_date',day,'requested_delivery_date',day+8,'discount_amount','0','notes','3B prueba','items',jsonb_build_array(jsonb_build_object('id','65000000-0000-4000-8000-000000000001','product_name_snapshot','Encargo','quantity','1','unit_price','1.00','discount_amount','0','is_active',true)));
 begin perform public.confirm_order(oid,1,'{"deposit_percentage":"12.501"}');raise exception 'Porcentaje de tres decimales';exception when invalid_parameter_value then null;end;
 if (select confirmed_at from public.orders where id=oid) is not null then raise exception 'Confirmación parcial';end if;
 perform public.confirm_order(oid,1,'{"deposit_percentage":"12.50"}');
 if not exists(select 1 from public.orders where id=oid and production_status='confirmed' and deposit_required_amount=.13 and deposit_percentage_applied=12.50 and order_number is not null) then raise exception 'Confirmación o HALF UP';end if;
 select order_number into old_number from public.orders where id=oid;
 begin perform public.confirm_order(oid,1,'{}');raise exception 'Segunda confirmación';exception when sqlstate 'PT409' then null;end;
 update public.settings set deposit_percentage=70;
 if (select deposit_required_amount from public.orders where id=oid)<>.13 then raise exception 'Adelanto mutable';end if;
 perform set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
 begin perform public.transition_order(oid,2,'{"state":"in_production"}');raise exception 'Gate omitido';exception when insufficient_privilege then null;end;
 foreach v in array array['0','-1','0.001','NaN','Infinity'] loop
 begin perform public.register_payment(oid,2,jsonb_build_object('amount',v,'payment_method','cash'));raise exception 'Pago inválido';exception when invalid_parameter_value then null;end;
 end loop;
 begin perform public.register_payment(oid,2,'{"amount":"2","payment_method":"cash"}');raise exception 'Sobrepago';exception when sqlstate 'PT409' then null;end;
 begin perform public.register_payment(oid,2,jsonb_build_object('amount','0.13','payment_method','cash','payment_date',(day-1)::text||'T12:00:00-06:00'));raise exception 'Pago histórico colaborador';exception when invalid_parameter_value then null;end;
 pid:=public.register_payment(oid,2,'{"amount":"0.13","payment_method":"sinpe_movil"}');
 if not exists(select 1 from public.order_payment_summary where order_id=oid and paid::numeric=.13 and balance::numeric=.87 and financial_status='partially_paid' and deposit_covered) then raise exception 'Resumen incorrecto';end if;
 begin perform public.void_payment(oid,3,jsonb_build_object('payment_id',pid,'reason','Intento'));raise exception 'Colaborador anula';exception when insufficient_privilege then null;end;
 begin perform public.amend_order(oid,3,jsonb_set(doc,'{items,0,unit_price}','"0.10"'));raise exception 'Total menor que pagos';exception when sqlstate 'PT409' then null;end;
 begin perform public.amend_order(oid,3,doc||'{"client_id":"62000000-0000-4000-8000-000000000002","reason":"Otro cliente"}');raise exception 'Colaborador cambia cliente';exception when insufficient_privilege then null;end;
 perform public.transition_order(oid,3,'{"state":"in_production"}');
 perform public.transition_order(oid,4,'{"state":"ready"}');
 perform public.transition_order(oid,5,'{"state":"delivered"}');
 if (select delivered_at from public.orders where id=oid) is null then raise exception 'Entrega sin fecha';end if;
 begin perform public.amend_order(oid,6,jsonb_set(doc,'{items,0,unit_price}','"2"'));raise exception 'Edición financiera entregado';exception when insufficient_privilege then null;end;
 begin perform public.transition_order(oid,6,'{"state":"ready","reason":"Reabrir"}');raise exception 'Retroceso colaborador';exception when insufficient_privilege then null;end;
 perform public.register_payment(oid,6,'{"amount":"0.87","payment_method":"cash"}');
 if not exists(select 1 from public.order_payment_summary where order_id=oid and balance::numeric=0 and financial_status='paid') then raise exception 'Cobro después de entregar';end if;
 perform set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
 begin perform public.transition_order(oid,7,'{"state":"cancelled","reason":"No directo"}');raise exception 'Cancelación directa entregado';exception when insufficient_privilege then null;end;
 perform public.transition_order(oid,7,'{"state":"ready","reason":"Reapertura"}');
 if (select delivered_at from public.orders where id=oid) is not null then raise exception 'Entrega anterior no limpia';end if;
 perform public.transition_order(oid,8,'{"state":"delivered"}');
 perform public.transition_order(oid,9,'{"state":"ready","reason":"Segunda reapertura"}');
 perform public.void_payment(oid,10,jsonb_build_object('payment_id',pid,'reason','Corrección autorizada'));
 if not exists(select 1 from public.order_payment_summary where order_id=oid and balance::numeric=.13) then raise exception 'Saldo anulación';end if;
 begin perform public.amend_order(oid,11,doc||'{"client_id":"62000000-0000-4000-8000-000000000002","reason":"Otro cliente"}');raise exception 'Cliente con pagos válidos';exception when insufficient_privilege then null;end;
 perform public.transition_order(oid,11,'{"state":"in_production","reason":"Retroceso uno"}');
 perform public.transition_order(oid,12,'{"state":"confirmed","reason":"Retroceso dos"}');
 begin perform public.transition_order(oid,13,'{"state":"quote","reason":"Prohibido"}');raise exception 'Volver a quote';exception when insufficient_privilege then null;end;
 perform public.transition_order(oid,13,'{"state":"cancelled","reason":"Conservar pagos"}');
 if (select count(*) from public.payments where order_id=oid)<>2 or (select sum(amount) from public.payments where order_id=oid and status='valid')<>.87 then raise exception 'Cancelación alteró pagos';end if;
 begin perform public.register_payment(oid,14,'{"amount":"0.13","payment_method":"cash"}');raise exception 'Pago cancelado';exception when insufficient_privilege then null;end;
 begin perform public.transition_order(oid,14,'{"state":"confirmed","reason":"No"}');raise exception 'Reactivar';exception when sqlstate 'PT409' then null;end;
 if (select order_number from public.orders where id=oid)<>old_number then raise exception 'Número modificado';end if;
 -- Total cero, sin pago ficticio, autorización nueva después de cada modificación comercial.
 doc:=jsonb_set(jsonb_set(doc,'{items,0,id}','"65000000-0000-4000-8000-000000000002"'),'{items,0,unit_price}','"0"');
 perform public.save_quote(oid2,0,doc);
 perform set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
 begin perform public.confirm_order(oid2,1,'{"zero_reason":"Regalo"}');raise exception 'Cero colaborador';exception when insufficient_privilege then null;end;
 begin perform public.confirm_order(oid2,1,'{"deposit_percentage":"20"}');raise exception 'Override colaborador';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
 begin perform public.confirm_order(oid2,1,'{}');raise exception 'Cero sin motivo';exception when invalid_parameter_value then null;end;
 perform public.confirm_order(oid2,1,'{"zero_reason":"Regalo autorizado"}');
 if not exists(select 1 from public.order_payment_summary where order_id=oid2 and financial_status='paid' and paid::numeric=0) then raise exception 'Cero estado';end if;
 begin perform public.amend_order(oid2,2,jsonb_set(doc,'{items,0,quantity}','"2"'));raise exception 'Reusar autorización';exception when invalid_parameter_value then null;end;
 perform public.amend_order(oid2,2,jsonb_set(doc,'{items,0,quantity}','"2"')||'{"zero_reason":"Regalo modificado"}');
 perform public.amend_order(oid2,3,jsonb_set(doc,'{items,0,unit_price}','"10"')||'{"client_id":"62000000-0000-4000-8000-000000000002","reason":"Cliente correcto"}');
 if (select deposit_required_amount from public.orders where id=oid2)<>0 then raise exception 'Adelanto histórico alterado';end if;
 perform public.transition_order(oid2,4,'{"state":"in_production"}');
 -- RLS y acceso directo.
 begin update public.payments set amount=1 where order_id=oid;raise exception 'UPDATE directo';exception when insufficient_privilege then null;end;
 begin delete from public.payments where order_id=oid;raise exception 'DELETE directo';exception when insufficient_privilege then null;end;
 if not exists(select 1 from public.order_history(oid) where action='order.reopened') then raise exception 'Historial operativo';end if;
 update public.profiles set status='inactive' where id='61000000-0000-4000-8000-000000000002';
 perform set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
 if exists(select 1 from public.payments) then raise exception 'Inactivo lee pagos';end if;
 begin perform public.register_payment(oid2,5,'{"amount":"1","payment_method":"cash"}');raise exception 'Inactivo paga';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.payments;raise exception 'Anon lee';exception when insufficient_privilege then null;end;
 begin perform public.confirm_order(gen_random_uuid(),1,'{}');raise exception 'Anon confirma';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS 3B: confirmación, HALF UP, pagos/saldos/anulación, estados, cero, permisos y terminalidad' as result;
