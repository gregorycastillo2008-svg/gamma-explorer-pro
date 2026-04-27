-- Trigger: cuando un usuario con el email del admin se registra, asignarle rol admin automáticamente
create or replace function public.assign_admin_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email = 'gregory0322@allgamma.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin'::app_role)
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_admin_trigger on auth.users;
create trigger assign_admin_trigger
  after insert on auth.users
  for each row execute function public.assign_admin_on_signup();

-- Asegurar unique constraint para que ON CONFLICT funcione
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_roles_user_id_role_key'
  ) then
    alter table public.user_roles add constraint user_roles_user_id_role_key unique (user_id, role);
  end if;
end $$;