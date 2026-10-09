drop function public.insert_line_items_with_audit(uuid, jsonb, text, text, jsonb);

create function public.insert_line_items_with_audit(
  p_project_id uuid,
  p_items jsonb,
  p_action text,
  p_endpoint text,
  p_summary jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result jsonb;
begin
  insert into public.audit_logs (action, endpoint, payload_summary)
  values (p_action, p_endpoint, p_summary);

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
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', r.id,
      'project_id', r.project_id,
      'item_code', r.item_code,
      'description', r.description,
      'volume', r.volume::text,
      'unit', r.unit,
      'unit_price', r.unit_price::text,
      'total_price', r.total_price::text,
      'created_at', r.created_at
    )),
    '[]'::jsonb
  )
  into result
  from inserted r;

  return result;
end;
$$;

revoke execute on function public.insert_line_items_with_audit(uuid, jsonb, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_line_items_with_audit(uuid, jsonb, text, text, jsonb)
  to service_role;
