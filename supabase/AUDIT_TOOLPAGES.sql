-- ELECTRA INDEX — AUDIT_TOOLPAGES : data-quality report + a 40-tool sample to review
-- Read-only. Paste into Supabase > SQL Editor > Run, then copy each result.

-- 1) coverage of the facts shown on tool pages
select count(*)                                                        as tools,
       count(*) filter (where length(coalesce(description, short_description, '')) >= 50) as indexable_description,
       count(*) filter (where remotes is not null)                     as with_hosted_endpoint,
       count(*) filter (where package_list is not null)                as with_package,
       count(*) filter (where remotes is null and package_list is null) as no_connect_info,
       count(*) filter (where remotes::text ~ 'https?://[^"]*[{]') as endpoint_with_placeholder,
       count(*) filter (where website is null and repository_url is null) as no_website_no_repo
  from v_mcp_servers;

-- 2) a stratified sample of 40 tools (hosted, npm, PyPI, Docker, both, none, short description)
with t as (
  select slug, name, remote, local, remotes, package_list, length(coalesce(description, short_description, '')) as desc_len,
         case when remotes is not null and package_list is not null then 'both'
              when remotes is not null then 'hosted'
              when package_list::text like '%"pypi"%' then 'pypi'
              when package_list::text like '%"oci"%' then 'docker'
              when package_list is not null then 'npm/other'
              when length(coalesce(description, short_description, '')) < 50 then 'thin'
              else 'none' end as kind
    from v_mcp_servers)
select kind, slug, name, desc_len, remotes, package_list, 'https://electraindex.com/mcp/' || slug as url
  from (select t.*, row_number() over (partition by kind order by md5(slug)) as rn from t) x
 where rn <= 6
 order by kind, slug;
