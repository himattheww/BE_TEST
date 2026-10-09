create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  client_name text not null check (btrim(client_name) <> ''),
  created_at timestamptz not null default now()
);

create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  item_code text not null check (btrim(item_code) <> ''),
  description text not null,
  volume numeric(18, 4) not null check (volume > 0),
  unit text,
  unit_price numeric(18, 2) not null check (unit_price >= 0),
  total_price numeric(22, 2) not null,
  created_at timestamptz not null default now(),
  constraint line_items_total_price_matches check (total_price = round(volume * unit_price, 2))
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  endpoint text not null,
  payload_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index line_items_project_id_idx on public.line_items (project_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.projects enable row level security;
alter table public.line_items enable row level security;
alter table public.audit_logs enable row level security;

create function public.insert_line_items_with_audit(
  p_project_id uuid,
  p_items jsonb,
  p_action text,
  p_endpoint text,
  p_summary jsonb
)
returns setof public.line_items
language plpgsql
set search_path = ''
as $$
begin
  insert into public.audit_logs (action, endpoint, payload_summary)
  values (p_action, p_endpoint, p_summary);

  return query
  with inserted as (
    insert into public.line_items (project_id, item_code, description, volume, unit, unit_price, total_price)
    select p_project_id, i.item_code, i.description, i.volume, i.unit, i.unit_price, i.total_price
    from jsonb_to_recordset(p_items) as i(
      item_code text,
      description text,
      volume numeric,
      unit text,
      unit_price numeric,
      total_price numeric
    )
    returning *
  )
  select * from inserted;
end;
$$;

revoke execute on function public.insert_line_items_with_audit(uuid, jsonb, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_line_items_with_audit(uuid, jsonb, text, text, jsonb)
  to service_role;
