-- Cobertura explícita de FKs compuestas de 4A, sin eliminar índices existentes.
begin;
create index inventory_balances_last_material on public.inventory_balances(last_movement_id,material_id);
create index inventory_movements_item_material on public.inventory_movements(receipt_item_id,material_id);
create index inventory_valuations_last_material on public.inventory_valuations(last_movement_id,material_id);
commit;
