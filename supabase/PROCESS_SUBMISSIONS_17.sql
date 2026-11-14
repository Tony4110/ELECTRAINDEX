-- ELECTRA INDEX — PROCESS_SUBMISSIONS_17 : 2 refus (13 Nov 2026)
--  Le statut "rejected" envoie automatiquement l'email de refus standard (critères + note ci-dessous).
--  Ne touche qu'aux demandes encore au statut "new". Re-runnable.

update public.submissions
set status = 'rejected', reviewed_at = now(),
    review_note = 'The pricing page is clear, but the website does not show the company name and country behind PACK AI STUDIO (criterion 3: identifiable publisher). Add them to your website (About or legal page) and submit again.'
where id = 'ef2661e4-89f8-47a3-b826-edf79a6b6927' and status = 'new';

update public.submissions
set status = 'rejected', reviewed_at = now(),
    review_note = 'The website does not name the person or company behind Meltbead (criterion 3), and we could not find a public repository or package for the bead-colors MCP server. Add both and submit again.'
where id = '51c830bb-9646-491f-9902-209bb07c59b5' and status = 'new';

-- Vérification : statut + email de refus parti ?
select s.name, s.status, s.reviewed_at,
       coalesce(n.skipped, case when n.id is not null then 'envoyé' end, 'pas encore d''email') as email,
       r.status_code as code_resend
from public.submissions s
left join lateral (select * from public.notify_log n
                   where n.recipient = s.contact_email and n.created_at > now() - interval '10 minutes'
                   order by n.created_at desc limit 1) n on true
left join net._http_response r on r.id = n.request_id
where s.id in ('ef2661e4-89f8-47a3-b826-edf79a6b6927', '51c830bb-9646-491f-9902-209bb07c59b5');
