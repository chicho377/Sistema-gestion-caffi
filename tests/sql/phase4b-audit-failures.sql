-- AuditorÃ­a 4B: siete fallos inducidos en PostgreSQL DEV. Todo dentro de ROLLBACK.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' and status='active' order by id limit 1),true);
create function pg_temp.inventory_audit_fingerprint() returns jsonb language plpgsql set search_path='' as $$
declare t text;r jsonb:='{}';h text;begin
 foreach t in array array['inventory_movements','inventory_movement_costs','inventory_balances','inventory_valuations','inventory_movement_attribution_corrections','inventory_adjustment_cost_evidence','audit_log'] loop
 execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,'','' order by to_jsonb(x)::text),'''')) from public.%I x',t) into h;r:=r||jsonb_build_object(t,h);
 end loop;return r;end $$;
create function pg_temp.inventory_audit_fail() returns trigger language plpgsql set search_path='' as $$begin
 if current_setting('sigca.audit_failure',true)=tg_table_name then raise exception '4B_INDUCED_%',current_setting('sigca.audit_failure') using errcode='P0001';end if; if current_setting('sigca.audit_failure',true)='multiline' and tg_table_name='inventory_movements' then if new.request_position=2 then raise exception '4B_INDUCED_multiline' using errcode='P0001';end if;end if;return new;end $$;
do $$declare t text;begin foreach t in array array['audit_log','inventory_movements','inventory_movement_costs','inventory_balances','inventory_valuations','inventory_movement_attribution_corrections'] loop execute format('create trigger phase4b_audit_failure_%I before insert or update on public.%I for each row execute function pg_temp.inventory_audit_fail()',t,t);end loop;end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();ord uuid;dest uuid;orev integer;drev integer;src uuid;stage text;prior jsonb;request uuid;op text;p jsonb;revs jsonb;ords jsonb;
begin
 select id,revision into strict ord,orev from public.orders where production_status='in_production' order by id limit 1;
 select id,revision into strict dest,drev from public.orders where confirmed_at is not null and id<>ord order by id limit 1;
 insert into public.materials(id,code,name,category,unit) values(a,'AUDIT-4B-'||a,'AuditorÃ­a transaccional 4B','Prueba','gramos'),(b,'AUDIT-4B-'||b,'AuditorÃ­a transaccional 4B','Prueba','gramos');
 perform public.register_inventory_receipt(rid,jsonb_build_object('kind','purchase','source_reference','Auditoría 4B transaccional','lines',jsonb_build_array(jsonb_build_object('material_id',a,'quantity','3','amount','10','currency','CRC','unit','gramos'),jsonb_build_object('material_id',b,'quantity','3','amount','10','currency','CRC','unit','gramos'))),jsonb_build_object(a::text,'0',b::text,'0'));
 src:=public.inventory_operation(gen_random_uuid(),'consumption',jsonb_build_object('material_id',a,'order_id',ord,'quantity','1'),jsonb_build_object(a::text,'1'),jsonb_build_object(ord::text,orev));
 set constraints all immediate;
 set constraints all deferred;
 foreach stage in array array['audit_log','inventory_movements','inventory_movement_costs','inventory_balances','inventory_valuations','inventory_movement_attribution_corrections','multiline'] loop
  perform set_config('sigca.audit_failure','',true);
  -- Para reversiÃ³n multilÃ­nea crear recepciÃ³n fresca en dos materiales sin dependencias.
  if stage='multiline' then
   a:=gen_random_uuid();b:=gen_random_uuid();rid:=gen_random_uuid();
   insert into public.materials(id,code,name,category,unit) values(a,'AUDIT-4B-'||a,'AuditorÃ­a rollback multi','Prueba','gramos'),(b,'AUDIT-4B-'||b,'AuditorÃ­a rollback multi','Prueba','gramos');
   perform public.register_inventory_receipt(rid,jsonb_build_object('kind','purchase','source_reference','Auditoría 4B transaccional','lines',jsonb_build_array(jsonb_build_object('material_id',a,'quantity','1','amount','1','currency','CRC','unit','gramos'),jsonb_build_object('material_id',b,'quantity','1','amount','1','currency','CRC','unit','gramos'))),jsonb_build_object(a::text,'0',b::text,'0'));
  end if;
  prior:=pg_temp.inventory_audit_fingerprint();request:=gen_random_uuid();ords:=jsonb_build_object(ord::text,orev,dest::text,drev);
  select jsonb_object_agg(material_id::text,revision::text) into revs from public.inventory_balances where material_id in(a,b);
  op:='adjustment_negative';p:=jsonb_build_object('material_id',a,'quantity','0.01','reason','Fallo inducido auditorÃ­a 4B');
  if stage='inventory_movement_attribution_corrections' then op:='attribution_correction';p:=jsonb_build_object('source_movement_id',src,'destination_order_id',dest,'attribution_revision','0','reason','Fallo atribuciÃ³n 4B');end if;
  if stage='multiline' then op:='receipt_reversal';p:=jsonb_build_object('receipt_id',rid,'reason','Fallo segunda lÃ­nea 4B');end if;
  perform set_config('sigca.audit_failure',stage,true);
  begin
   perform public.inventory_operation(request,op,p,revs,ords);raise exception 'No disparÃ³ el fallo %',stage using errcode='ZX001';
  exception when sqlstate 'P0001' then if sqlerrm<>'4B_INDUCED_'||stage then raise;end if;end;
  if pg_temp.inventory_audit_fingerprint() is distinct from prior then raise exception 'Estado parcial tras %',stage;end if;
 end loop;
 perform set_config('sigca.audit_failure','',true);
end $$;
rollback;
select 'PASS: 7 fallos inducidos, fingerprints Ã­ntegros, infraestructura revertida' as result;
