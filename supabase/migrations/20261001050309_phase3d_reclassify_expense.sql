-- D-20: reclasificación administrativa; sin DML directo ni cambios financieros.
begin;
create or replace function private.guard_expense() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'No se permite borrar gastos' using errcode='42501';end if;
 if not private.is_active() then raise exception 'Acceso no autorizado' using errcode='42501';end if;
 if tg_op='INSERT' then
  if new.created_by is distinct from auth.uid() or new.updated_by is distinct from auth.uid() or new.status<>'valid' or new.expense_date>clock_timestamp() then raise exception 'Gasto no autorizado' using errcode='42501';end if;
  new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
  new.is_historical:=(new.expense_date at time zone 'America/Costa_Rica')::date<(new.created_at at time zone 'America/Costa_Rica')::date;
  if new.is_historical and not private.is_admin() then raise exception 'Históricos solo Administración' using errcode='42501';end if;
 else
  if old.status<>'valid' or (old.created_by<>auth.uid() and not private.is_admin()) or new.updated_by is distinct from auth.uid() or new.revision<>old.revision+1 or
   (to_jsonb(new)-array['category_id','description','notes','updated_by','updated_at','revision','status','voided_by','voided_at','void_reason']) is distinct from (to_jsonb(old)-array['category_id','description','notes','updated_by','updated_at','revision','status','voided_by','voided_at','void_reason']) then raise exception 'Datos originales inmutables' using errcode='42501';end if;
  if new.category_id is distinct from old.category_id then
   if not private.is_admin() or new.status<>'valid' or new.description is distinct from old.description or new.notes is distinct from old.notes then raise exception 'Reclasificación solo Administración, sin alterar otros datos' using errcode='42501';end if;
   perform 1 from public.expense_categories where id=new.category_id and is_active for share;
   if not found then raise exception 'Categoría destino no disponible' using errcode='22023';end if;
  end if;
  if new.status='voided' then
   if not private.is_admin() or new.voided_by is distinct from auth.uid() or new.description is distinct from old.description or new.notes is distinct from old.notes then raise exception 'Anulación solo Administración, sin alterar original' using errcode='42501';end if;
   new.voided_at:=clock_timestamp();
  end if;
  new.updated_at:=clock_timestamp();
 end if;return new;
end $$;

create function private.reclassify_expense(target uuid,expected_revision integer,new_category uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare previous public.expenses; changed public.expenses; why text;
begin
 perform private.expense_actor();
 if not private.is_admin() then raise exception 'Solo Administración reclasifica gastos' using errcode='42501';end if;
 previous:=private.lock_expense(target,expected_revision);
 why:=private.order_reason(reason);
 if new_category is null or new_category=previous.category_id then raise exception 'Selecciona una categoría diferente' using errcode='22023';end if;
 perform 1 from public.expense_categories where id=new_category and is_active for share;
 if not found then raise exception 'Categoría destino no disponible' using errcode='22023';end if;
 update public.expenses set category_id=new_category,updated_by=auth.uid(),revision=revision+1 where id=target returning * into changed;
 insert into public.audit_log(user_id,action,entity_type,entity_id,reason,metadata) values(auth.uid(),'expense.category_changed','expenses',target,why,jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(changed)));
end $$;
create function public.reclassify_expense(target uuid,expected_revision integer,new_category uuid,reason text) returns void language sql security invoker set search_path='' as $$select private.reclassify_expense(target,expected_revision,new_category,reason)$$;
revoke all on function private.reclassify_expense(uuid,integer,uuid,text),public.reclassify_expense(uuid,integer,uuid,text) from public,anon,authenticated,service_role;
-- Admin/Colaborador comparten rol PostgreSQL authenticated: autorización Admin vigente dentro de RPC.
grant execute on function private.reclassify_expense(uuid,integer,uuid,text),public.reclassify_expense(uuid,integer,uuid,text) to authenticated;
commit;
