-- Execute em um projeto Supabase novo, pelo SQL Editor.
-- Pessoas devem ser criadas manualmente em Authentication > Users.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Colaborador',
  role text not null default 'vendedor' check (role in ('admin','gerente','vendedor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,name,role)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'name',''),'Colaborador'),'vendedor');
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create schema if not exists private;
create or replace function private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin','gerente') and p.active);
$$;
create or replace function private.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.active);
$$;

create table public.leads (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name))>0),
 phone text default '',
 need text default '',
 origin text default 'BR Whats',
 owner_id uuid not null references public.profiles(id),
 status text not null default 'Novo lead' check(status in ('Novo lead','Contato pendente','Em negociação','Agendado','Compareceu','Orçamento aberto','Venda concluída','Perdido / encerrado')),
 priority text not null default 'Média' check(priority in ('Alta','Média','Baixa')),
 next_action text default '',
 due_date date,
 expected_value numeric(12,2) not null default 0 check(expected_value>=0),
 consent text not null default 'Verificar' check(consent in ('Sim','Não','Verificar')),
 notes text default '',
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.activities (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.leads(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 channel text not null check(channel in ('Ligação','WhatsApp','Presencial','Outro')),
 kind text not null default 'Recontato',
 outcome text not null default '',
 next_action text default '',
 next_due date,
 created_at timestamptz not null default now()
);

create table public.appointments (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.leads(id) on delete cascade,
 owner_id uuid not null references public.profiles(id),
 scheduled_at timestamptz not null,
 status text not null default 'Pendente' check(status in ('Pendente','Confirmado','Compareceu','Faltou','Cancelado','Reagendado')),
 notes text default '',
 created_at timestamptz not null default now()
);

create table public.sales (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.leads(id),
 seller_id uuid not null references public.profiles(id),
 amount numeric(12,2) not null check(amount>=0),
 sold_at date not null default current_date,
 notes text default '',
 created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger touch_leads before update on public.leads for each row execute function public.touch_updated_at();

create index leads_owner_due on public.leads(owner_id,due_date);
create index leads_status_due on public.leads(status,due_date);
create index activities_lead_date on public.activities(lead_id,created_at desc);
create index appointments_owner_date on public.appointments(owner_id,scheduled_at);
create index sales_date_seller on public.sales(sold_at,seller_id);

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;
alter table public.appointments enable row level security;
alter table public.sales enable row level security;

revoke all on public.profiles, public.leads, public.activities, public.appointments, public.sales from anon, authenticated;
grant select on public.profiles to authenticated;
grant select,insert,update,delete on public.leads,public.activities,public.appointments,public.sales to authenticated;

create policy "profiles_read" on public.profiles for select to authenticated
 using ((select private.is_active()) and (id=(select auth.uid()) or (select private.is_manager())));

create policy "leads_read" on public.leads for select to authenticated
 using ((select private.is_active()) and ((select private.is_manager()) or owner_id=(select auth.uid())));
create policy "leads_add" on public.leads for insert to authenticated
 with check ((select private.is_active()) and ((select private.is_manager()) or owner_id=(select auth.uid())) and (created_by is null or created_by=(select auth.uid())));
create policy "leads_edit" on public.leads for update to authenticated
 using ((select private.is_active()) and ((select private.is_manager()) or owner_id=(select auth.uid())))
 with check ((select private.is_active()) and ((select private.is_manager()) or owner_id=(select auth.uid())));
create policy "leads_delete" on public.leads for delete to authenticated
 using ((select private.is_manager()));

create policy "activities_read" on public.activities for select to authenticated
 using ((select private.is_active()) and ((select private.is_manager()) or exists(select 1 from public.leads l where l.id=lead_id and l.owner_id=(select auth.uid()))));
create policy "activities_add" on public.activities for insert to authenticated
 with check ((select private.is_active()) and user_id=(select auth.uid()) and exists(select 1 from public.leads l where l.id=lead_id and ((select private.is_manager()) or l.owner_id=(select auth.uid()))));
create policy "activities_edit" on public.activities for update to authenticated
 using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "activities_delete" on public.activities for delete to authenticated
 using ((select private.is_manager()));

create policy "appointments_read" on public.appointments for select to authenticated
 using ((select private.is_active()) and ((select private.is_manager()) or owner_id=(select auth.uid())));
create policy "appointments_add" on public.appointments for insert to authenticated
 with check ((select private.is_active()) and ((select private.is_manager()) or owner_id=(select auth.uid())) and exists(select 1 from public.leads l where l.id=lead_id and ((select private.is_manager()) or l.owner_id=(select auth.uid()))));
create policy "appointments_edit" on public.appointments for update to authenticated
 using ((select private.is_active()) and ((select private.is_manager()) or owner_id=(select auth.uid())))
 with check ((select private.is_active()) and ((select private.is_manager()) or owner_id=(select auth.uid())) and exists(select 1 from public.leads l where l.id=lead_id and ((select private.is_manager()) or l.owner_id=(select auth.uid()))));
create policy "appointments_delete" on public.appointments for delete to authenticated using ((select private.is_manager()));

create policy "sales_read" on public.sales for select to authenticated
 using ((select private.is_active()) and ((select private.is_manager()) or seller_id=(select auth.uid())));
create policy "sales_add" on public.sales for insert to authenticated
 with check ((select private.is_active()) and seller_id=(select auth.uid()) and exists(select 1 from public.leads l where l.id=lead_id and ((select private.is_manager()) or l.owner_id=(select auth.uid()))));
create policy "sales_edit" on public.sales for update to authenticated using ((select private.is_manager())) with check ((select private.is_manager()));
create policy "sales_delete" on public.sales for delete to authenticated using ((select private.is_manager()));

-- IMPORTANTE: depois de criar um usuário de administrador em Auth > Users,
-- execute substituindo o endereço abaixo pelo e-mail real do administrador:
-- update public.profiles set role='admin', name='Administrador IVS'
-- where id=(select id from auth.users where email='EMAIL_DO_ADMIN@EXEMPLO.COM');
-- Promova o gerente da mesma forma com role='gerente'.
-- Nunca exponha chave service_role no frontend.
