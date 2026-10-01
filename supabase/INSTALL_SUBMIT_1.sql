-- ELECTRA INDEX — INSTALL_SUBMIT_1 : 'List your agent' submissions table
-- Paste everything into Supabase > SQL Editor > Run.

-- =====================================================================
-- 0016 — "List your agent": public submissions
--  Anyone can submit; nobody can read submissions through the public API.
--  A submission is only a lead: nothing is published until our robots
--  have read the vendor's own pages (no source, no claim).
-- =====================================================================
create table if not exists submissions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  kind         text not null default 'agent' check (kind in ('agent','tool')),
  name         text not null check (char_length(name) between 2 and 120),
  website      text not null check (website ~* '^https?://[a-z0-9.-]+\.[a-z]{2,}' and char_length(website) <= 300),
  pricing_url  text check (pricing_url is null or (pricing_url ~* '^https?://' and char_length(pricing_url) <= 300)),
  theme        text check (theme is null or char_length(theme) <= 60),
  description  text check (description is null or char_length(description) <= 600),
  contact_email text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 200),
  status       text not null default 'new' check (status in ('new','accepted','rejected','duplicate','listed')),
  reviewed_at  timestamptz,
  entity_id    uuid references entities(id)
);
create index if not exists idx_submissions_status on submissions(status, created_at desc);
alter table submissions enable row level security;
drop policy if exists submit_insert on submissions;
create policy submit_insert on submissions for insert to anon, authenticated
  with check (status = 'new' and reviewed_at is null and entity_id is null);
revoke all on submissions from anon, authenticated;
grant insert (kind, name, website, pricing_url, theme, description, contact_email) on submissions to anon, authenticated;

select 'submissions ready' as status, count(*) as submissions from submissions;
