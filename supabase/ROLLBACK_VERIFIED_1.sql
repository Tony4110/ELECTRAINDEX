-- ELECTRA INDEX — ROLLBACK_VERIFIED_1 : stops Electra Verified (undo of INSTALL_VERIFIED_1)
--  Stops the 4 schedules and puts the badge and MCP page functions back as in Reliability V1.
--  Verified requests are kept (status unchanged) so the pilot can restart; nothing is deleted.
-- Paste everything in Supabase > SQL Editor > Run.

select cron.unschedule(jobid) from cron.job where jobname like 'electra-verified-%';

-- badge: the 30-day figure (Monitoring Pro only, unchanged display) now comes from the shared calculation
create or replace function monitor_badge(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_pro boolean; r jsonb;
begin
  select id into v_id from entities where type = 'mcp_server' and is_published and slug = p_slug;
  if v_id is null then return null; end if;
  v_pro := exists (select 1 from monitor_subs where entity_id = v_id and status = 'active');
  select jsonb_build_object(
           'status', case when l.status in ('online','auth_required') then l.status
                          when l.consecutive_failures >= 2 then 'down' else 'unconfirmed' end,
           'checked_at', l.checked_at, 'pro', v_pro,
           'rate30', case when v_pro then (mcp_obs(v_id, 30)->>'availability')::numeric end)
    into r from mcp_live_status l where l.entity_id = v_id;
  return coalesce(r, jsonb_build_object('status', 'unchecked', 'pro', v_pro));
end $$;
revoke execute on function monitor_badge(text) from public;
grant execute on function monitor_badge(text) to anon, authenticated;

create or replace function mcp_public_reliability(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_pro boolean;
begin
  select id into v_id from entities where type = 'mcp_server' and is_published and slug = p_slug;
  if v_id is null then return null; end if;
  v_pro := exists (select 1 from monitor_subs where entity_id = v_id and status = 'active');
  return jsonb_build_object(
    'd30', mcp_obs(v_id, 30),
    'history_since', (select min(checked_at) from mcp_live_history where entity_id = v_id),
    'frequency', case when v_pro then '30min' else 'standard' end,
    'checks', (select coalesce(jsonb_agg(jsonb_build_object('at', checked_at, 'c', cls) order by checked_at), '[]')
                 from (select x.checked_at,
                              case when exists (select 1 from mcp_check_incidents i where i.window_start = mcp_window(x.checked_at)) then 'excluded'
                                   else mcp_check_class(x.status, x.http) end as cls
                         from mcp_live_history x
                        where x.entity_id = v_id and x.checked_at > now() - interval '30 days'
                        order by x.checked_at desc limit 60) k),
    'tool_changes', mcp_tool_changes(v_id));
end $$;
revoke execute on function mcp_public_reliability(text) from public;
grant execute on function mcp_public_reliability(text) to anon, authenticated;

select 'schedules left' as check_name, count(*)::text as result from cron.job where jobname like 'electra-verified-%';
