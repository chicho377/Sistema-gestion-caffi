-- Probar expresiones CHECK de DEV en clones temporales con constraints reales.
-- No modificar movimientos originales ni deshabilitar sus triggers.
begin;
create temporary table audit_4b_movements (like public.inventory_movements including all);
create temporary table audit_4b_costs (like public.inventory_movement_costs including all);
insert into audit_4b_movements select * from public.inventory_movements where movement_type='purchase_entry' limit 1;
insert into audit_4b_movements select * from public.inventory_movements where movement_type='consumption' limit 1;
insert into audit_4b_costs select * from public.inventory_movement_costs where valuation_version='moving_average_value_v1' limit 1;
insert into audit_4b_costs select * from public.inventory_movement_costs where valuation_version='proportional_value_v2' and value_after_crc>0 limit 1;
insert into audit_4b_costs select * from public.inventory_movement_costs where valuation_version='proportional_value_v2' and value_after_crc=0 limit 1;
do $$declare m uuid;c uuid;z uuid;receipt uuid;begin
 select id,receipt_item_id into strict m,receipt from audit_4b_movements where movement_type='purchase_entry';
 begin update audit_4b_movements set receipt_item_id=null where id=m;raise exception 'Entrada sin receipt_item permitida' using errcode='ZX001';exception when check_violation then null;end;
 select id into strict m from audit_4b_movements where movement_type='consumption';
 begin update audit_4b_movements set receipt_item_id=receipt where id=m;raise exception 'Consumo con receipt_item permitido' using errcode='ZX001';exception when check_violation then null;end;
 select movement_id into strict c from audit_4b_costs where valuation_version='moving_average_value_v1';
 begin update audit_4b_costs set movement_amount_crc=null where movement_id=c;raise exception 'V1 importe NULL permitido' using errcode='ZX001';exception when check_violation then null;end;
 begin update audit_4b_costs set internal_amount_crc=1 where movement_id=c;raise exception 'V1 delta interno permitido' using errcode='ZX001';exception when check_violation then null;end;
 select movement_id into strict c from audit_4b_costs where valuation_version='proportional_value_v2' and value_after_crc>0;
 begin update audit_4b_costs set movement_amount_crc=1 where movement_id=c;raise exception 'V2 importe convencional permitido' using errcode='ZX001';exception when check_violation then null;end;
 begin update audit_4b_costs set internal_amount_crc=null where movement_id=c;raise exception 'V2 valor NULL permitido' using errcode='ZX001';exception when check_violation then null;end;
 begin update audit_4b_costs set average_cost_after_crc=null where movement_id=c;raise exception 'Valor positivo/promedio NULL permitido' using errcode='ZX001';exception when check_violation then null;end;
 select movement_id into strict z from audit_4b_costs where valuation_version='proportional_value_v2' and value_after_crc=0;
 begin update audit_4b_costs set average_cost_after_crc=1 where movement_id=z;raise exception 'Valor cero/promedio positivo permitido' using errcode='ZX001';exception when check_violation then null;end;
end $$;
rollback;
select 'PASS: 8 combinaciones inválidas rechazadas por constraints reales en clones temporales' as result;
