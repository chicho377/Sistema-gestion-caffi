-- Fase 1 solamente. D-01, D-13, D-16, D-17 / RF-USR, RF-AUD.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null default '',
  email text not null,
  role text not null default 'collaborator' check (role in ('admin', 'collaborator')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_access_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);
create index audit_log_actor_date_idx on public.audit_log(user_id, created_at);
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.profiles, public.audit_log from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update(role, status) on public.profiles to authenticated;
grant select on public.audit_log to authenticated;

-- Definer privado y search_path vacío: consulta acotada evita recursión de RLS.
create function private.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and status = 'active');
$$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and status = 'active' and role = 'admin');
$$;
revoke all on function private.is_active(), private.is_admin() from public, anon, authenticated;
grant execute on function private.is_active(), private.is_admin() to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using ((select private.is_active()) and (id = (select auth.uid()) or (select private.is_admin())));
create policy profiles_admin_update on public.profiles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy audit_admin_read on public.audit_log for select to authenticated
  using ((select private.is_admin()));

create function private.guard_profile() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.id <> old.id then raise exception 'Profile identity is immutable'; end if;
  if new.role is distinct from old.role and old.id = auth.uid() then
    raise exception 'Cannot change your own role' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_profile before update on public.profiles for each row execute function private.guard_profile();

create function private.audit_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), case when TG_OP = 'INSERT' then 'profile.created' else 'profile.updated' end,
    'profiles', new.id,
    case when TG_OP = 'INSERT' then jsonb_build_object('role',new.role,'status',new.status)
    else jsonb_build_object('before',jsonb_build_object('role',old.role,'status',old.status),
      'after',jsonb_build_object('role',new.role,'status',new.status)) end);
  return new;
end;
$$;
create trigger audit_profile after insert or update of role, status on public.profiles
  for each row execute function private.audit_profile();

-- auth.users es la fuente de identidad. Metadata nunca determina rol/estado.
create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,email,role,status)
  values(new.id, left(coalesce(new.raw_user_meta_data->>'full_name',''),120),coalesce(new.email,''),'collaborator','active');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();

create function private.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email,'') where id = new.id;
  return new;
end;
$$;
create trigger on_auth_email_updated after update of email on auth.users
  for each row execute function private.sync_profile_email();

create function private.record_access() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_active() then raise exception 'Forbidden' using errcode='42501'; end if;
  update public.profiles set last_access_at=now() where id=auth.uid();
  insert into public.audit_log(user_id,action,entity_type,entity_id)
    values(auth.uid(),'auth.login','profiles',auth.uid());
end;
$$;
create function public.record_access() returns void
language sql security invoker set search_path = '' as $$ select private.record_access(); $$;

create function private.record_invitation(target_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
  if length(target_email)>254 or position('@' in target_email)<2 then raise exception 'Invalid email'; end if;
  insert into public.audit_log(user_id,action,entity_type,metadata)
    values(auth.uid(),'user.invitation_requested','profiles',jsonb_build_object('email',target_email));
end;
$$;
create function public.record_invitation(target_email text) returns void
language sql security invoker set search_path = '' as $$ select private.record_invitation(target_email); $$;

revoke all on function private.guard_profile(), private.audit_profile(), private.create_profile(), private.sync_profile_email(),
  private.record_access(), private.record_invitation(text), public.record_access(), public.record_invitation(text)
  from public, anon, authenticated;
grant execute on function private.record_access(), private.record_invitation(text), public.record_access(), public.record_invitation(text) to authenticated;
-- No INSERT/DELETE de profiles ni escritura de audit_log por roles de aplicación.
commit;
