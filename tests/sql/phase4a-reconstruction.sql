-- Solo lectura: comprobar todas las proyecciones contra el diario actual.
with chain as (
 select m.*,c.value_before_crc,c.value_after_crc,c.average_cost_after_crc,
 c.rounding_delta_crc,c.unit_cost_applied_crc,c.movement_amount_crc,
 sum(m.quantity) over(partition by m.material_id order by m.material_sequence) as reconstructed_quantity,
 sum(c.movement_amount_crc) over(partition by m.material_id order by m.material_sequence) as reconstructed_value,
 row_number() over(partition by m.material_id order by m.material_sequence) as reconstructed_sequence
 from public.inventory_movements m join public.inventory_movement_costs c on c.movement_id=m.id
)
select
 (select count(*) from chain where stock_after<>reconstructed_quantity or value_after_crc<>reconstructed_value
 or material_sequence<>reconstructed_sequence or average_cost_after_crc<>round(reconstructed_value/reconstructed_quantity,8)
 or rounding_delta_crc<>movement_amount_crc-quantity*unit_cost_applied_crc) as chain_errors,
 (select count(*) from public.inventory_balances b join public.inventory_valuations v using(material_id)
 left join chain c on c.id=b.last_movement_id where c.id is null or b.quantity_on_hand<>c.reconstructed_quantity
 or v.value_crc<>c.reconstructed_value or b.revision<>c.material_sequence or v.revision<>b.revision) as projection_errors,
 (select count(*) from public.inventory_movements m left join public.inventory_movement_costs c on c.movement_id=m.id
 where c.movement_id is null) as missing_costs,
 (select count(*) from public.inventory_balances where quantity_on_hand<0) as negative_stock,
 to_regclass('public.work_sessions') as timer_table,to_regclass('public.shipments') as shipment_table,
 (select count(*) from pg_proc where pronamespace='public'::regnamespace
 and proname ~ '(inventory.*(consum|return|adjust)|(consum|return|adjust).*inventory)') as later_phase_rpcs;
