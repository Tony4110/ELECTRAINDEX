-- Electra Index · FIX_I18N_FR_1 : 2 corrections de Tony (ada, hex-agent). Sans risque, peut être lancé deux fois.
select
  i18n_set('agent', 'ada', 'fr', 'short_description', 'Agent de service client IA d''entreprise opérant par voix, messagerie et e-mail et effectuant des actions dans les systèmes d''entreprise.', 'Enterprise AI customer service agent across voice, messaging and email that takes actions in business systems.') as ada,
  i18n_set('agent', 'hex-agent', 'fr', 'short_description', 'Carnet de données et espace de travail BI avec un agent d''IA qui écrit du SQL/Python et génère des analyses.', 'Data notebook and BI workspace with an AI agent that writes SQL/Python and builds analyses.') as hex_agent;
