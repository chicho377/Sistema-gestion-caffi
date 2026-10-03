-- Lectura independiente: sumar deltas del diario, sin usar saldos como acumulador.
with journal as (
 select m.*,c.value_before_crc,c.value_after_crc,c.average_cost_after_crc,
 case when m.movement_type in ('consumption','adjustment_negative','entry_reversal') then -1 else 1 end as sign,
 coalesce(c.internal_amount_crc,c.movement_amount_crc) as amount
 from public.inventory_movements m join public.inventory_movement_costs c on c.movement_id=m.id
), reconstructed as (
 select *,sum(sign*quantity) over w as reconstructed_quantity,sum(sign*amount) over w as reconstructed_value,
 row_number() over w as reconstructed_sequence
 from journal window w as(partition by material_id order by material_sequence rows unbounded preceding)
), checks as (
 select *,case when reconstructed_quantity=0 then null else round(reconstructed_value/reconstructed_quantity,8) end as reconstructed_average from reconstructed
)
select
 (select count(*) from public.inventory_movements) as movements,
 (select count(*) from checks where stock_after<>reconstructed_quantity or value_after_crc<>reconstructed_value or material_sequence<>reconstructed_sequence or average_cost_after_crc is distinct from reconstructed_average or reconstructed_quantity<0 or reconstructed_value<0) as journal_mismatches,
 (select count(*) from public.inventory_movements m left join public.inventory_movement_costs c on c.movement_id=m.id where c.movement_id is null) as missing_costs,
 (select count(*) from public.inventory_balances b join public.inventory_valuations v using(material_id) left join checks c on c.id=b.last_movement_id where b.revision>0 and (c.id is null or b.quantity_on_hand<>c.reconstructed_quantity or v.value_crc<>c.reconstructed_value or v.average_unit_cost_crc is distinct from c.reconstructed_average or b.revision<>c.reconstructed_sequence or v.revision<>b.revision or v.last_movement_id<>b.last_movement_id)) as projection_mismatches,
 (select count(*) from public.inventory_movements c join public.inventory_movement_costs cost on cost.movement_id=c.id join lateral(select sum(r.quantity) as quantity,sum(rc.internal_amount_crc) as amount from public.inventory_movements r join public.inventory_movement_costs rc on rc.movement_id=r.id where r.source_movement_id=c.id and r.movement_type='return') returned on true where c.movement_type='consumption' and (returned.quantity>c.quantity or returned.amount>cost.internal_amount_crc or (returned.quantity=c.quantity and returned.amount<>cost.internal_amount_crc) or (returned.quantity<c.quantity and returned.amount>=cost.internal_amount_crc))) as return_mismatches;
