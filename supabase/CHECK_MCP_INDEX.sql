-- ELECTRA INDEX — CHECK_MCP_INDEX : make sure the public site can read the new mcp_index table, and test it as the site does.
--  Adds a read-only public policy (the data is the same list already shown on the site). Re-runnable.
drop policy if exists mcp_index_read on mcp_index;
create policy mcp_index_read on mcp_index for select to anon, authenticated using (true);
grant select on mcp_index to anon, authenticated;

set role anon;
select count(*) as indexable_seen_by_site,
       (select count(*) from (select slug from v_mcp_index where indexable order by slug offset 5000 limit 1000) x) as rows_for_sitemap_2
  from v_mcp_index where indexable;
reset role;
