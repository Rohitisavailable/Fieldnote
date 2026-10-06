create table if not exists public.fieldnote_generation_usage (
  user_id uuid not null,
  usage_day date not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_day)
);

alter table public.fieldnote_generation_usage enable row level security;
revoke all on table public.fieldnote_generation_usage from anon, authenticated;
grant all on table public.fieldnote_generation_usage to service_role;

create or replace function public.consume_fieldnote_generation(
  p_user_id uuid,
  p_daily_limit integer default 12
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count integer;
begin
  if p_user_id is null or p_daily_limit < 1 or p_daily_limit > 100 then
    raise exception 'Invalid rate limit request';
  end if;

  insert into public.fieldnote_generation_usage (user_id, usage_day, request_count)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_day)
  do update set request_count = public.fieldnote_generation_usage.request_count + 1
  returning request_count into new_count;

  return new_count <= p_daily_limit;
end;
$$;

revoke all on function public.consume_fieldnote_generation(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_fieldnote_generation(uuid, integer) to service_role;
