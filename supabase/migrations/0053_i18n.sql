-- 0053 · Translations (FR first, then ES/DE)
-- Facts (prices, scores, names, dates) are never translated: only text fields.
-- source_text = the English text that was translated. If the English changes, the row is "stale"
-- and shows up in i18n_todo() for re-translation; the page keeps the old translation meanwhile.

create table if not exists entity_i18n (
  entity_id   uuid not null references entities(id) on delete cascade,
  lang        text not null check (lang in ('fr','es','de')),
  field       text not null check (field in ('short_description')),
  value       text not null,
  source_text text,
  updated_at  timestamptz not null default now(),
  primary key (entity_id, lang, field)
);
alter table entity_i18n enable row level security;

create or replace view v_agent_i18n as
select e.slug, t.lang, t.value as short_description,
       (t.source_text is distinct from e.short_description) as stale, t.updated_at
  from entity_i18n t join entities e on e.id = t.entity_id
 where e.type = 'agent' and e.is_published and t.field = 'short_description';
grant select on v_agent_i18n to anon, authenticated;

-- Agents with no translation (or an outdated one) for a language.
create or replace function i18n_todo(p_lang text default 'fr')
returns table (slug text, name text, short_description text, status text)
language sql stable security definer set search_path = public as $$
  select e.slug, e.name, e.short_description,
         case when t.entity_id is null then 'missing' else 'stale' end
    from entities e
    left join entity_i18n t on t.entity_id = e.id and t.lang = p_lang and t.field = 'short_description'
   where e.type = 'agent' and e.is_published
     and coalesce(trim(e.short_description), '') <> ''
     and (t.entity_id is null or t.source_text is distinct from e.short_description)
   order by e.slug;
$$;
revoke all on function i18n_todo(text) from public, anon, authenticated;

-- Write one translation (used by INSTALL files).
create or replace function i18n_set(p_type text, p_slug text, p_lang text, p_field text, p_value text, p_source text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from entities where type = p_type and slug = p_slug;
  if v_id is null then return false; end if;
  insert into entity_i18n (entity_id, lang, field, value, source_text)
  values (v_id, p_lang, p_field, p_value, p_source)
  on conflict (entity_id, lang, field) do update set value = excluded.value, source_text = excluded.source_text, updated_at = now();
  return true;
end $$;
revoke all on function i18n_set(text,text,text,text,text,text) from public, anon, authenticated;
