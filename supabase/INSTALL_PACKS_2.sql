-- ELECTRA INDEX — INSTALL_PACKS_2 : clearer developer-key email (step-by-step for Claude Code, Cursor, VS Code, other clients)
-- Paste everything into Supabase > SQL Editor > Run. Re-runnable (keeps existing keys).

-- =====================================================================
-- 0044 — Developer packs for the Electra Index MCP server
--  A pack = an API key with prepaid calls for the paid tools
--  (default: USD 5 = 600 calls, valid 6 months), bought by card (Stripe).
--  * The key is shown once, by email. Only its SHA-256 hash is stored.
--  * dev_pack_issue(): called by the Stripe webhook on the server
--    (protected by the Vault secret 'mcp_api_secret'). Idempotent on the
--    Stripe session id: a retried webhook never creates a second key.
--  * api_key_use(): called by the MCP server for each paid call; uses one
--    credit atomically, refuses when empty, expired or revoked.
-- =====================================================================

create table if not exists api_keys (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  key_hash      text not null unique,
  key_prefix    text not null,
  email         text not null,
  credits_total int not null check (credits_total > 0),
  credits_used  int not null default 0,
  expires_at    timestamptz,
  source        text not null default 'manual' check (source in ('stripe','manual','x402')),
  source_ref    text unique,
  revoked       boolean not null default false,
  last_used_at  timestamptz
);
alter table api_keys enable row level security;   -- private

create or replace function mcp_secret_ok(p_secret text) returns boolean language plpgsql security definer set search_path = public, vault as $$
declare v text;
begin
  begin select decrypted_secret into v from vault.decrypted_secrets where name = 'mcp_api_secret' limit 1;
  exception when others then v := null; end;
  return coalesce(v, '') <> '' and p_secret = v;
end $$;
revoke execute on function mcp_secret_ok(text) from public, anon, authenticated;

create or replace function dev_pack_issue(p_secret text, p_email text, p_credits int default 600, p_days int default 183,
                                          p_source text default 'manual', p_ref text default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_key text; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'invalid email'; end if;
  if p_ref is not null and exists (select 1 from api_keys where source_ref = p_ref) then return 'exists'; end if;
  v_key := 'ei_' || encode(gen_random_bytes(24), 'hex');
  insert into api_keys(key_hash, key_prefix, email, credits_total, expires_at, source, source_ref)
  values (encode(digest(v_key, 'sha256'), 'hex'), left(v_key, 9), v_email, greatest(p_credits, 1),
          case when p_days > 0 then now() + make_interval(days => p_days) end,
          coalesce(nullif(p_source, ''), 'manual'), p_ref);
  perform send_email('dev_pack', v_email, 'Your Electra Index developer key',
    'Hi,' || chr(10) || chr(10) ||
    'Thank you for your Electra Index developer pack: ' || greatest(p_credits, 1) || ' calls to the paid tools of the Electra Index MCP server' ||
    case when p_days > 0 then ', valid until ' || to_char(now() + make_interval(days => p_days), 'DD Mon YYYY') else '' end || '.' || chr(10) || chr(10) ||
    'YOUR KEY (shown only once, keep it private like a password):' || chr(10) || v_key || chr(10) || chr(10) ||
    'HOW TO USE IT (pick your tool)' || chr(10) || chr(10) ||
    '1) Claude Code, in the Terminal:' || chr(10) ||
    'claude mcp add --transport http electra-index https://electraindex.com/api/mcp --header "Authorization: Bearer ' || v_key || '"' || chr(10) || chr(10) ||
    '2) Cursor, in the file ~/.cursor/mcp.json:' || chr(10) ||
    '{ "mcpServers": { "electra-index": { "url": "https://electraindex.com/api/mcp", "headers": { "Authorization": "Bearer ' || v_key || '" } } } }' || chr(10) || chr(10) ||
    '3) VS Code, in the file .vscode/mcp.json:' || chr(10) ||
    '{ "servers": { "electra-index": { "type": "http", "url": "https://electraindex.com/api/mcp", "headers": { "Authorization": "Bearer ' || v_key || '" } } } }' || chr(10) || chr(10) ||
    '4) Any other client or your own agent: endpoint https://electraindex.com/api/mcp with the HTTP header' || chr(10) ||
    'Authorization: Bearer ' || v_key || chr(10) || chr(10) ||
    'Then ask your assistant, for example: "Show the availability history of the kinocut MCP server".' || chr(10) ||
    'Each paid call uses one credit. Step-by-step guide: https://electraindex.com/mcp-server#setup' || chr(10) || chr(10) ||
    'Lost key or question? Reply to this email.' || chr(10) || chr(10) ||
    'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com', 200);
  -- copy to contact@ (without the key)
  perform notify_email('dev_pack_sold', 'Developer pack sold: ' || greatest(p_credits, 1) || ' calls (' || coalesce(p_source, 'manual') || ')',
    'A developer pack was issued to ' || v_email || ' (' || greatest(p_credits, 1) || ' calls, source ' || coalesce(p_source, 'manual') || ', ref ' || coalesce(p_ref, '-') || ').');
  return 'issued';
end $$;
revoke execute on function dev_pack_issue(text, text, int, int, text, text) from public;
grant execute on function dev_pack_issue(text, text, int, int, text, text) to anon, authenticated;   -- protected by the secret

create or replace function api_key_use(p_secret text, p_key text, p_tool text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;
  update api_keys set credits_used = credits_used + 1, last_used_at = now()
   where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex')
     and not revoked and credits_used < credits_total and (expires_at is null or expires_at > now())
  returning credits_total - credits_used as remaining into r;
  if found then return jsonb_build_object('ok', true, 'remaining', r.remaining); end if;
  select * into r from api_keys where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex');
  return jsonb_build_object('ok', false, 'reason',
    case when not found then 'unknown key' when r.revoked then 'key revoked'
         when r.expires_at <= now() then 'key expired' else 'no credits left' end);
end $$;
revoke execute on function api_key_use(text, text, text) from public;
grant execute on function api_key_use(text, text, text) to anon, authenticated;   -- protected by the secret

select 'packs v2 ready' as status, (select count(*) from api_keys) as keys_sold;
