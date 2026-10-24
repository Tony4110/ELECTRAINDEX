/**
 * Translated names and URLs of tasks and themes (French first).
 * English slug -> [French slug, French name]. Facts (rankings, scores) stay the same data.
 * A task missing here simply has no French page (links fall back to English).
 */
export const TASKS_FR: Record<string, [string, string]> = {
  "write-code-from-a-specification": ["ecrire-du-code-a-partir-d-une-specification", "Écrire du code à partir d'une spécification"],
  "review-pull-requests": ["relire-les-pull-requests", "Relire les pull requests"],
  "fix-bugs-in-a-codebase": ["corriger-des-bugs-dans-un-code", "Corriger des bugs dans un code"],
  "generate-unit-tests": ["generer-des-tests-unitaires", "Générer des tests unitaires"],
  "migrate-a-codebase-to-a-new-framework": ["migrer-un-code-vers-un-nouveau-framework", "Migrer un code vers un nouveau framework"],
  "build-an-internal-tool": ["creer-un-outil-interne", "Créer un outil interne"],
  "automate-ci-cd-pipelines": ["automatiser-les-pipelines-ci-cd", "Automatiser les pipelines CI/CD"],
  "scan-code-for-vulnerabilities": ["detecter-les-failles-de-securite-du-code", "Détecter les failles de sécurité du code"],
  "write-technical-documentation": ["rediger-la-documentation-technique", "Rédiger la documentation technique"],
  "build-a-website": ["creer-un-site-web", "Créer un site web"],
  "integrate-two-apis": ["connecter-deux-api", "Connecter deux API"],
  "monitor-production-incidents": ["surveiller-les-incidents-en-production", "Surveiller les incidents en production"],
  "research-competitors": ["etudier-les-concurrents", "Étudier les concurrents"],
  "research-a-company": ["se-renseigner-sur-une-entreprise", "Se renseigner sur une entreprise"],
  "do-market-research": ["realiser-une-etude-de-marche", "Réaliser une étude de marché"],
  "summarize-academic-papers": ["resumer-des-articles-scientifiques", "Résumer des articles scientifiques"],
  "monitor-news-on-a-topic": ["suivre-l-actualite-d-un-sujet", "Suivre l'actualité d'un sujet"],
  "build-a-literature-review": ["realiser-une-revue-de-litterature", "Réaliser une revue de littérature"],
  "fact-check-a-document": ["verifier-les-faits-d-un-document", "Vérifier les faits d'un document"],
  "track-regulatory-changes": ["suivre-les-evolutions-reglementaires", "Suivre les évolutions réglementaires"],
  "analyze-patents": ["analyser-des-brevets", "Analyser des brevets"],
  "answer-questions-from-internal-documents": ["repondre-aux-questions-a-partir-de-documents-internes", "Répondre aux questions à partir de documents internes"],
  "write-seo-articles": ["rediger-des-articles-seo", "Rédiger des articles SEO"],
  "find-influencers": ["trouver-des-influenceurs", "Trouver des influenceurs"],
  "manage-social-media-accounts": ["gerer-les-reseaux-sociaux", "Gérer les réseaux sociaux"],
  "create-ad-creatives": ["creer-des-visuels-publicitaires", "Créer des visuels publicitaires"],
  "produce-short-videos": ["produire-des-videos-courtes", "Produire des vidéos courtes"],
  "run-email-marketing-campaigns": ["mener-des-campagnes-d-e-mailing", "Mener des campagnes d'e-mailing"],
  "audit-website-seo": ["auditer-le-seo-d-un-site", "Auditer le SEO d'un site"],
  "optimize-for-ai-search-geo": ["optimiser-pour-la-recherche-ia-geo", "Optimiser pour la recherche IA (GEO)"],
  "translate-marketing-content": ["traduire-des-contenus-marketing", "Traduire des contenus marketing"],
  "monitor-brand-mentions": ["surveiller-les-mentions-de-marque", "Surveiller les mentions de marque"],
  "plan-a-content-calendar": ["planifier-un-calendrier-editorial", "Planifier un calendrier éditorial"],
  "analyze-campaign-performance": ["analyser-la-performance-des-campagnes", "Analyser la performance des campagnes"],
  "find-leads": ["trouver-des-leads", "Trouver des leads"],
  "qualify-leads": ["qualifier-des-leads", "Qualifier des leads"],
  "enrich-crm-contacts": ["enrichir-les-contacts-du-crm", "Enrichir les contacts du CRM"],
  "send-personalized-outreach": ["envoyer-une-prospection-personnalisee", "Envoyer une prospection personnalisée"],
  "book-sales-meetings": ["obtenir-des-rendez-vous-commerciaux", "Obtenir des rendez-vous commerciaux"],
  "make-outbound-sales-calls": ["passer-des-appels-de-prospection", "Passer des appels de prospection"],
  "write-sales-proposals": ["rediger-des-propositions-commerciales", "Rédiger des propositions commerciales"],
  "update-the-crm-after-calls": ["mettre-a-jour-le-crm-apres-les-appels", "Mettre à jour le CRM après les appels"],
  "forecast-sales-pipeline": ["prevoir-le-pipeline-commercial", "Prévoir le pipeline commercial"],
  "research-accounts-before-meetings": ["preparer-ses-rendez-vous-clients", "Préparer ses rendez-vous clients"],
  "follow-up-on-quotes": ["relancer-les-devis", "Relancer les devis"],
  "find-b2b-partners": ["trouver-des-partenaires-b2b", "Trouver des partenaires B2B"],
  "answer-customer-questions": ["repondre-aux-questions-des-clients", "Répondre aux questions des clients"],
  "triage-support-tickets": ["trier-les-tickets-de-support", "Trier les tickets de support"],
  "automate-customer-support": ["automatiser-le-support-client", "Automatiser le support client"],
  "answer-support-phone-calls": ["repondre-aux-appels-du-support", "Répondre aux appels du support"],
  "handle-refund-requests": ["traiter-les-demandes-de-remboursement", "Traiter les demandes de remboursement"],
  "build-a-help-center": ["creer-un-centre-d-aide", "Créer un centre d'aide"],
  "support-customers-in-many-languages": ["assister-les-clients-en-plusieurs-langues", "Assister les clients en plusieurs langues"],
  "analyze-customer-feedback": ["analyser-les-retours-clients", "Analyser les retours clients"],
  "track-orders-for-customers": ["suivre-les-commandes-des-clients", "Suivre les commandes des clients"],
  "run-satisfaction-surveys": ["mener-des-enquetes-de-satisfaction", "Mener des enquêtes de satisfaction"],
  "analyze-financial-documents": ["analyser-des-documents-financiers", "Analyser des documents financiers"],
  "automate-bookkeeping": ["automatiser-la-comptabilite", "Automatiser la comptabilité"],
  "send-and-chase-invoices": ["envoyer-et-relancer-les-factures", "Envoyer et relancer les factures"],
  "reconcile-payments": ["rapprocher-les-paiements", "Rapprocher les paiements"],
  "build-financial-models": ["construire-des-modeles-financiers", "Construire des modèles financiers"],
  "process-expense-receipts": ["traiter-les-notes-de-frais", "Traiter les notes de frais"],
  "monitor-company-cash-flow": ["suivre-la-tresorerie-de-l-entreprise", "Suivre la trésorerie de l'entreprise"],
  "research-investment-opportunities": ["etudier-des-opportunites-d-investissement", "Étudier des opportunités d'investissement"],
  "prepare-tax-documents": ["preparer-les-documents-fiscaux", "Préparer les documents fiscaux"],
  "detect-fraudulent-transactions": ["detecter-les-transactions-frauduleuses", "Détecter les transactions frauduleuses"],
  "extract-website-data": ["extraire-les-donnees-d-un-site-web", "Extraire les données d'un site web"],
  "query-databases-in-plain-language": ["interroger-une-base-de-donnees-en-langage-courant", "Interroger une base de données en langage courant"],
  "clean-and-merge-spreadsheets": ["nettoyer-et-fusionner-des-tableurs", "Nettoyer et fusionner des tableurs"],
  "build-dashboards": ["creer-des-tableaux-de-bord", "Créer des tableaux de bord"],
  "extract-data-from-pdfs": ["extraire-les-donnees-de-pdf", "Extraire les données de PDF"],
  "monitor-prices": ["surveiller-les-prix", "Surveiller les prix"],
  "generate-reports": ["generer-des-rapports", "Générer des rapports"],
  "forecast-demand": ["prevoir-la-demande", "Prévoir la demande"],
  "label-and-classify-data": ["etiqueter-et-classer-des-donnees", "Étiqueter et classer des données"],
  "build-data-pipelines": ["creer-des-pipelines-de-donnees", "Créer des pipelines de données"],
  "manage-my-inbox": ["gerer-ma-boite-mail", "Gérer ma boîte mail"],
  "schedule-meetings": ["planifier-des-reunions", "Planifier des réunions"],
  "take-meeting-notes": ["prendre-des-notes-de-reunion", "Prendre des notes de réunion"],
  "book-travel": ["reserver-des-voyages", "Réserver des voyages"],
  "summarize-long-documents": ["resumer-des-documents-longs", "Résumer des documents longs"],
  "draft-emails": ["rediger-des-e-mails", "Rédiger des e-mails"],
  "create-presentations": ["creer-des-presentations", "Créer des présentations"],
  "transcribe-audio-and-video": ["transcrire-de-l-audio-et-de-la-video", "Transcrire de l'audio et de la vidéo"],
  "fill-web-forms-automatically": ["remplir-des-formulaires-web-automatiquement", "Remplir des formulaires web automatiquement"],
  "automate-repetitive-desktop-tasks": ["automatiser-les-taches-repetitives-sur-ordinateur", "Automatiser les tâches répétitives sur ordinateur"],
  "test-web-applications": ["tester-des-applications-web", "Tester des applications web"],
  "book-appointments-online": ["prendre-rendez-vous-en-ligne", "Prendre rendez-vous en ligne"],
  "compare-products-online": ["comparer-des-produits-en-ligne", "Comparer des produits en ligne"],
  "buy-products-online": ["acheter-des-produits-en-ligne", "Acheter des produits en ligne"],
  "collect-data-behind-logins": ["collecter-des-donnees-derriere-une-connexion", "Collecter des données derrière une connexion"],
  "operate-legacy-software": ["piloter-des-logiciels-anciens", "Piloter des logiciels anciens"],
  "recruit-developers": ["recruter-des-developpeurs", "Recruter des développeurs"],
  "screen-job-applicants": ["preselectionner-des-candidats", "Présélectionner des candidats"],
  "automate-business-workflows": ["automatiser-les-processus-metier", "Automatiser les processus métier"],
  "manage-procurement": ["gerer-les-achats", "Gérer les achats"],
  "review-contracts": ["analyser-des-contrats", "Analyser des contrats"],
  "manage-an-online-store": ["gerer-une-boutique-en-ligne", "Gérer une boutique en ligne"],
  "analyze-real-estate": ["analyser-l-immobilier", "Analyser l'immobilier"],
  "onboard-new-employees": ["integrer-les-nouveaux-employes", "Intégrer les nouveaux employés"],
};

export const THEMES_FR_SLUG: Record<string, string> = {
  coding: "developpement", research: "recherche", marketing: "marketing", sales: "ventes", "customer-support": "support-client",
  finance: "finance", data: "donnees", productivity: "productivite", "browser-computer-use": "navigateur-et-ordinateur", "business-operations": "operations",
};

const invert = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const TASK_FR_TO_EN = invert(Object.fromEntries(Object.entries(TASKS_FR).map(([k, v]) => [k, v[0]])));
const THEME_FR_TO_EN = invert(THEMES_FR_SLUG);
const TASK_NAME_EN_TO_FR = new Map<string, string>();

/** "Write SEO articles" (English name from the database) -> French name. */
export function taskNameFr(english: string, slug?: string): string {
  if (slug && TASKS_FR[slug]) return TASKS_FR[slug][1];
  if (!TASK_NAME_EN_TO_FR.size) for (const [s, [, fr]] of Object.entries(TASKS_FR)) TASK_NAME_EN_TO_FR.set(s.replace(/-/g, " "), fr);
  const key = english.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return TASK_NAME_EN_TO_FR.get(key) ?? english;
}

/** English path -> French path, or null if the page has no French version. */
export function toFrPath(base: string): string | null {
  if (base === "/tasks") return "/taches";
  if (base === "/themes") return "/themes";
  let m = base.match(/^\/tasks\/([a-z0-9-]+)$/);
  if (m) return TASKS_FR[m[1]] ? `/taches/${TASKS_FR[m[1]][0]}` : null;
  m = base.match(/^\/themes\/([a-z0-9-]+)$/);
  if (m) return THEMES_FR_SLUG[m[1]] ? `/themes/${THEMES_FR_SLUG[m[1]]}` : null;
  return null;
}

/** French path (without /fr) -> English path. */
export function fromFrPath(base: string): string {
  if (base === "/taches") return "/tasks";
  let m = base.match(/^\/taches\/([a-z0-9-]+)$/);
  if (m) return TASK_FR_TO_EN[m[1]] ? `/tasks/${TASK_FR_TO_EN[m[1]]}` : base;
  m = base.match(/^\/themes\/([a-z0-9-]+)$/);
  if (m) return THEME_FR_TO_EN[m[1]] ? `/themes/${THEME_FR_TO_EN[m[1]]}` : base;
  return base;
}
export const frTaskToEn = (frSlug: string) => TASK_FR_TO_EN[frSlug] ?? null;
export const frThemeToEn = (frSlug: string) => THEME_FR_TO_EN[frSlug] ?? null;
