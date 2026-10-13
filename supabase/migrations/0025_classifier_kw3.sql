-- =====================================================================
-- 0025 — Capability keywords v3 for 10 noisy use cases (validated with
--  PREVIEW_CLASSIFIER_KW3). Bare words that pulled in unrelated tools are
--  removed: x402 / wallet (payments), receipts / ledger (bookkeeping),
--  security (security scanning), github / gitlab (code review), coding agent
--  (code generation), market intelligence (competitors), exchange rates /
--  crypto & stock prices (price monitoring), cv (resume), contracts = smart
--  contracts (documents), "instantly" the word (outreach).
--  Only keyword-derived links of these 10 capabilities are rebuilt; links
--  declared by vendors, other capabilities, scores and the crawler are untouched.
-- =====================================================================
update capability_patterns set pattern = v.p, version = 'kw-v3'
from (values
 ('payments',               '\m(payments?|stripe|paypal|checkout|crypto payments?|agent wallets?|lightning network|x402 facilitators?)\M'),
 ('bookkeeping',            '\m(bookkeeping|accounting|general ledger|quickbooks|xero|expense (tracking|reports?|management)|receipt (scanning|ocr|capture))\M'),
 ('security-scanning',      '\m(security (scans?|scanner|scanning|audits?|testing)|vulnerabilit(y|ies)|cves?|pentest(ing)?|secrets? (detection|scanning)|sast|dast|owasp|malware|threat intel(ligence)?)\M'),
 ('code-review',            '\m(code reviews?|review (pull requests?|code|prs)|pull request reviews?|linters?|linting|static analysis)\M'),
 ('code-generation',        '\m(code generation|generate code|coding assistant|codegen|scaffold(ing)?|boilerplate|write code)\M'),
 ('competitor-monitoring',  '\m(competitors?|competitor (analysis|tracking|monitoring)|competitive intelligence|brand monitoring|brand mentions?)\M'),
 ('price-monitoring',       '\m(price (tracking|monitoring|comparison|alerts?|history)|track prices?|product prices?)\M'),
 ('resume-screening',       '\m(resumes?|curriculum vitae|cv (parsing|screening|builder)|applicants?|candidate screening|applicant tracking)\M'),
 ('document-understanding', '\m(pdfs?|docx|word documents?|documents? (parsing|analysis|understanding|processing|extraction)|contract (analysis|review|redlining)|legal contracts?|ocr)\M'),
 ('outreach-sequencing',    '\m(outreach|cold (e-?mails?|outreach)|email sequences?|instantly\.ai|lemlist|smartlead|drip campaigns?)\M')
) as v(slug, p)
where capability_patterns.capability_slug = v.slug;

create or replace function reclassify_capabilities(p_slugs text[], p_method text default 'kw-v3') returns jsonb
language plpgsql as $$
declare v_src uuid := source_id_of('SRC-001'); n_del int; n_add int;
begin
  delete from relations r using entities c
   where c.id = r.to_id and c.type = 'capability' and c.slug = any(p_slugs)
     and r.relation = 'has_capability' and r.evidence_level = 'derived';
  get diagnostics n_del = row_count;
  insert into relations(from_id, relation, to_id, evidence_level, confidence, source_id, evidence)
  select e.id, 'has_capability', c.id, 'derived', 'low', v_src, p_method || ': ' || (regexp_match(t.txt, p.pattern))[1]
    from entities e
    cross join lateral (select lower(e.name || ' ' || coalesce(e.short_description, '') || ' ' || coalesce(e.description, '')) as txt) t
    join capability_patterns p on p.capability_slug = any(p_slugs) and t.txt ~ p.pattern
    join entities c on c.type = 'capability' and c.slug = p.capability_slug
   where e.type in ('mcp_server','agent') and e.is_published
  on conflict (from_id, relation, to_id, evidence_level) do nothing;
  get diagnostics n_add = row_count;
  return jsonb_build_object('removed_links', n_del, 'new_links', n_add);
end $$;
revoke execute on function reclassify_capabilities(text[], text) from public, anon, authenticated;
