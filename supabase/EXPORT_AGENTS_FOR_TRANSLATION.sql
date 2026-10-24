-- Electra Index — export of agent descriptions for the French translation.
-- READ ONLY: this changes nothing in the database.
-- After Run: in the results, click "Export" → "Download CSV".
select slug, name, short_description
from v_agent_cards
where short_description is not null and length(trim(short_description)) > 0
order by slug;
