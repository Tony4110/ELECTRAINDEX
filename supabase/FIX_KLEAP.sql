-- ELECTRA INDEX — FIX_KLEAP : publisher request of 19 Nov 2026 (hello@kleap.co)
--  The MCP registry gives https://kleap.co/mcp as Kleap's website, so the page had no link to the product itself.
--  -> Website: https://kleap.co/ · MCP documentation link: https://kleap.co/mcp (both checked on kleap.co, 19 Nov 2026).
--  Note: if Kleap's registry entry keeps websiteUrl = kleap.co/mcp, the next registry update puts it back;
--        Kleap is asked to change it in their server.json.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

-- 1. the documentation link (existing publisher correction function, no use case changed)
select publisher_correction('mcp_server', 'kleap', '{}', '{}', 'https://kleap.co/mcp', null,
                            'publisher request (hello@kleap.co)');

-- 2. the website: the product's home page, declared by the publisher
update entities
   set website = 'https://kleap.co/',
       attributes = attributes || jsonb_build_object('website.url',
                      jsonb_build_object('value', 'https://kleap.co/', 'source', 'publisher', 'checked_at', current_date))
 where type = 'mcp_server' and slug = 'kleap';

-- 3. check
select slug, name, website, docs_url, repository_url from v_mcp_servers where slug = 'kleap';
