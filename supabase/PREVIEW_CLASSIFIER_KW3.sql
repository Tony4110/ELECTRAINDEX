-- ELECTRA INDEX — PREVIEW (read-only, changes nothing): tighter keywords for 10 noisy use cases.
-- Shows, per use case, how many tools are matched today vs with the new keywords,
-- and 5 examples of tools that would be REMOVED and 5 that would be KEPT.
with np(slug, pattern) as (values
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
), txt as (
  select e.id, e.name, lower(e.name || ' ' || coalesce(e.short_description, '') || ' ' || coalesce(e.description, '')) as t
    from entities e where e.type = 'mcp_server' and e.is_published
), now_ as (
  select c.slug, r.from_id as id from relations r join entities c on c.id = r.to_id and c.type = 'capability'
   where r.relation = 'has_capability' and r.evidence_level = 'derived' and r.valid_to is null
     and c.slug in (select slug from np)
), new_ as (
  select np.slug, txt.id from np join txt on txt.t ~ np.pattern
)
select np.slug as use_case,
       (select count(distinct id) from now_ n join txt using (id) where n.slug = np.slug) as tools_today,
       (select count(*) from new_ w where w.slug = np.slug) as tools_after,
       (select string_agg(name, ' | ') from (select txt.name from now_ n join txt using (id) where n.slug = np.slug
           and not exists (select 1 from new_ w where w.slug = np.slug and w.id = n.id) order by random() limit 5) x) as removed_examples,
       (select string_agg(name, ' | ') from (select txt.name from new_ w join txt using (id) where w.slug = np.slug order by random() limit 5) y) as kept_examples
  from np order by 1;
