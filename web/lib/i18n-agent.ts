/**
 * Texts of the agent page (and the boxes it uses) per language.
 * Only the presentation is translated: names, prices, scores and dates are the same data in every language.
 * ES / DE fall back to English until their phase starts.
 */
import type { Lang } from "@/lib/i18n";

const en = {
  metaTitle: (n: string) => `${n} — pricing, quality score and alternatives`,
  metaDesc: (n: string) => `${n}: price plans, Agent Score and capabilities.`,
  crumbAgents: "AI agents", by: "by", noDesc: "No description published.",
  visit: "Visit website ↗", officialPricing: "Official pricing ↗",
  kv: { score: "Agent Score", from: "From", trust: "Trust", api: "API", mcp: "MCP server", oss: "Open source", yes: "YES", no: "NO", nd: "NOT DOCUMENTED" },
  components: { capability: "Capabilities", integration: "Integrations", documentation: "Documentation", pricing: "Pricing clarity", transparency: "Transparency", freshness: "Freshness", human_oversight: "Human oversight" } as Record<string, string>,
  billing: { free: "Free", subscription: "Subscription", usage: "Pay as you go", credits: "Credits", seat: "Per seat", one_time: "One-time", enterprise_quote: "On quote", open_source: "Open source" } as Record<string, string>,
  onQuote: "On quote", free: "Free", month: "/month", year: "/year", perUnit: " per unit", oneTime: " one-time", trial: "trial",
  ev: { verified: "✓ Verified", declared: "Declared", no: "No", unknown: "— Unknown" },
  why: "Why this score?", methodology: "Methodology", confidence: "confidence", verifiedOn: "verified",
  whyScore: (n: number) => `Agent Score ${n}/100.`, notScored: "Not scored yet.",
  strongest: (x: string[]) => `Strongest on ${x.join(" and ")}.`, thinner: (x: string[]) => `Thinner on ${x.join(" and ")}.`,
  pricingRead: "Pricing read on the vendor's own page.", pricingStated: "Pricing stated by the vendor, not yet verified.", noPricing: "No pricing published.",
  notMeasured: (n: number) => `${n} criteria not measured yet — shown as Unknown, never counted as a failure.`,
  thClaim: "Claim", thEvidence: "Evidence", thStatus: "Status",
  rowPricing: "Pricing", rowPricingEv: "Vendor pricing page", rowCaps: "Capabilities", capsEv: (v: number, d: number) => `${v} verified · ${d} declared`,
  rowApi: "Public API", rowMcp: "MCP support", rowOss: "Open source", siteDocs: "Vendor site / docs", repoVendor: "Repository / vendor",
  rule: "No source → no claim. Criteria we can't evidence score 0 and read “Unknown” — never a guess. Unknown ≠ false.",
  pricing: "Pricing", readOnPage: "Read on the vendor's pricing page", statedNotVerified: "Stated by the vendor, not yet verified", checked: "checked", noPrice: "No price published.",
  capabilities: "Capabilities", asStated: "As stated on the vendor's website", noCap: "No capability documented yet.",
  breakdown: "Score breakdown", notMeasuredYet: "Not measured yet",
  alternatives: "Alternatives", seeAll: "See all →", noneListed: "None listed yet.", compare: "Compare →",
  builtAlt: (n: string) => `Built an alternative to ${n}?`, listFree: (n: string) => ` List it for free: we check its official pricing and rank it next to ${n}.`, listBtn: "List your agent →",
  history: "Price history", baseline: "Baseline", baselineText: "No change yet. Every price change will appear here with its date.",
  priceChange: "Price change",
};
export type AgentDict = typeof en;

const fr: AgentDict = {
  metaTitle: (n) => `${n} — prix, score de qualité et alternatives`,
  metaDesc: (n) => `${n} : offres et prix, Score Agent et fonctionnalités.`,
  crumbAgents: "Agents IA", by: "par", noDesc: "Aucune description publiée.",
  visit: "Visiter le site ↗", officialPricing: "Tarifs officiels ↗",
  kv: { score: "Score Agent", from: "À partir de", trust: "Confiance", api: "API", mcp: "Serveur MCP", oss: "Open source", yes: "OUI", no: "NON", nd: "NON DOCUMENTÉ" },
  components: { capability: "Fonctionnalités", integration: "Intégrations", documentation: "Documentation", pricing: "Clarté des prix", transparency: "Transparence", freshness: "Fraîcheur", human_oversight: "Contrôle humain" },
  billing: { free: "Gratuit", subscription: "Abonnement", usage: "Paiement à l'usage", credits: "Crédits", seat: "Par utilisateur", one_time: "Paiement unique", enterprise_quote: "Sur devis", open_source: "Open source" },
  onQuote: "Sur devis", free: "Gratuit", month: "/mois", year: "/an", perUnit: " par unité", oneTime: " en une fois", trial: "essai",
  ev: { verified: "✓ Vérifié", declared: "Déclaré", no: "Non", unknown: "— Inconnu" },
  why: "Pourquoi ce score ?", methodology: "Méthodologie", confidence: "confiance", verifiedOn: "vérifié le",
  whyScore: (n) => `Score Agent ${n}/100.`, notScored: "Pas encore noté.",
  strongest: (x) => `Points forts : ${x.join(" et ").toLowerCase()}.`, thinner: (x) => `Plus faible sur : ${x.join(" et ").toLowerCase()}.`,
  pricingRead: "Prix relevés sur la page officielle de l'éditeur.", pricingStated: "Prix déclarés par l'éditeur, pas encore vérifiés.", noPricing: "Aucun prix publié.",
  notMeasured: (n) => `${n} critère${n > 1 ? "s" : ""} pas encore mesuré${n > 1 ? "s" : ""} : affiché${n > 1 ? "s" : ""} « Inconnu », jamais compté${n > 1 ? "s" : ""} comme un échec.`,
  thClaim: "Information", thEvidence: "Preuve", thStatus: "Statut",
  rowPricing: "Prix", rowPricingEv: "Page tarifs de l'éditeur", rowCaps: "Fonctionnalités", capsEv: (v, d) => `${v} vérifiée${v > 1 ? "s" : ""} · ${d} déclarée${d > 1 ? "s" : ""}`,
  rowApi: "API publique", rowMcp: "Support MCP", rowOss: "Open source", siteDocs: "Site / documentation de l'éditeur", repoVendor: "Dépôt / éditeur",
  rule: "Pas de source, pas d'affirmation. Un critère que nous ne pouvons pas prouver vaut 0 et s'affiche « Inconnu », jamais une supposition. Inconnu ≠ faux.",
  pricing: "Tarifs", readOnPage: "Relevés sur la page tarifs de l'éditeur", statedNotVerified: "Déclarés par l'éditeur, pas encore vérifiés", checked: "vérifiés le", noPrice: "Aucun prix publié.",
  capabilities: "Fonctionnalités", asStated: "Telles qu'indiquées sur le site de l'éditeur", noCap: "Aucune fonctionnalité documentée pour l'instant.",
  breakdown: "Détail du score", notMeasuredYet: "Pas encore mesuré",
  alternatives: "Alternatives", seeAll: "Tout voir →", noneListed: "Aucune pour l'instant.", compare: "Comparer →",
  builtAlt: (n) => `Vous avez créé une alternative à ${n} ?`, listFree: (n) => ` Listez-la gratuitement : nous vérifions ses tarifs officiels et la classons à côté de ${n}.`, listBtn: "Lister votre agent →",
  history: "Historique des prix", baseline: "Point de départ", baselineText: "Aucun changement pour l'instant. Chaque changement de prix apparaîtra ici avec sa date.",
  priceChange: "Prix modifié",
};

export function agentT(lang: Lang): AgentDict { return lang === "fr" ? fr : en; }

/** Capability names (the 50 of the taxonomy) — English comes from the database. */
const CAP_FR: Record<string, string> = {
  "web-research": "Recherche web", "web-scraping": "Scraping web", "browser-automation": "Automatisation de navigateur", "computer-use": "Utilisation d'ordinateur",
  "data-extraction": "Extraction de données", "document-understanding": "Compréhension de documents", "data-analysis": "Analyse de données", "sql-querying": "Requêtes SQL",
  "spreadsheet-automation": "Automatisation de tableurs", forecasting: "Prévisions", "report-generation": "Génération de rapports", summarization: "Résumés",
  translation: "Traduction", "content-writing": "Rédaction de contenu", "seo-optimization": "Optimisation SEO", "image-generation": "Génération d'images",
  "video-generation": "Génération de vidéos", "voice-calls": "Appels vocaux", "speech-transcription": "Transcription audio", "email-automation": "Automatisation des e-mails",
  "social-media-management": "Gestion des réseaux sociaux", "influencer-discovery": "Recherche d'influenceurs", "lead-generation": "Génération de leads", "lead-enrichment": "Enrichissement de leads",
  "lead-scoring": "Scoring de leads", "crm-integration": "Intégration CRM", "outreach-sequencing": "Séquences de prospection", "meeting-scheduling": "Prise de rendez-vous",
  "calendar-management": "Gestion d'agenda", "customer-chat": "Chat client", "ticket-triage": "Tri des tickets", "knowledge-base-qa": "Réponses depuis une base de connaissances",
  "code-generation": "Génération de code", "code-review": "Revue de code", "test-generation": "Génération de tests", debugging: "Débogage",
  "devops-automation": "Automatisation DevOps", "security-scanning": "Analyse de sécurité", "workflow-orchestration": "Orchestration de workflows", "api-integration": "Intégration d'API",
  payments: "Paiements", invoicing: "Facturation", bookkeeping: "Tenue de comptabilité", "price-monitoring": "Suivi des prix",
  "e-commerce-management": "Gestion e-commerce", procurement: "Achats", "travel-booking": "Réservation de voyages", "candidate-sourcing": "Recherche de candidats",
  "resume-screening": "Tri de CV", "competitor-monitoring": "Veille concurrentielle",
};
export function capName(lang: Lang, slug: string, english: string) { return lang === "fr" ? CAP_FR[slug] ?? english : english; }

/** Small shared boxes (status, report, follow, share, affiliate, sponsor). */
const boxEn = {
  status: { new: "NEW", updated: "Updated", official: "✓ Official source checked", recheckDue: "Re-check due · verified", lastVerified: "Last verified" },
  sponsored: "Sponsored", learnMore: "Learn more",
  affiliate: "Affiliate link: Electra Index may earn a commission if you subscribe, at no extra cost to you. It never changes scores or rankings.", neutral: "How we stay neutral",
  share: "Share:", copyLink: "Copy link", copied: "Link copied",
  shareAgent: (n: string, u: string) => `${n} is now listed on Electra Index, the independent index of AI agents with verified prices and rankings. See how we compare: ${u} #AIagents`,
  kitTitle: (n: string) => `Are you the publisher of ${n}?`, kitSub: "Free · show your listing",
  kitText: "An independent listing builds trust with your buyers. Announce it, and add the badge to your website or README.",
  kitLinkedIn: "Announce it on LinkedIn", copyHtml: "Copy HTML", copyMd: "Copy Markdown", copiedShort: "Copied",
  report: {
    title: "Is this page accurate?", sub: "Flag it and our robot re-checks the official source. Reports never change a score.",
    kinds: { price_wrong: "Price is wrong", info_outdated: "Info is outdated", not_working: "Doesn't work", broken_link: "Broken link", other: "Something else" } as Record<string, string>,
    msg: {
      ok: "Thank you. Your report is logged and our robot will re-check the official source. Reports never change a score.",
      already_reported: "You already reported this today. Thank you, it is in the queue.",
      links_not_allowed: "Please remove links from your note and send again.",
      rate_limited: "Too many reports from your connection right now. Please try again later.",
      invalid: "This report could not be recorded.", error: "Something went wrong. Please try again later.",
    } as Record<string, string>,
    underReview: "Community report received · under review",
    received: (n: number) => `${n} community report${n > 1 ? "s" : ""} received · re-check scheduled`,
    rechecked: (ago: string) => `✓ Re-checked ${ago} after a community report: still matches the official source`,
    whatWrong: "What is wrong?", note: "What is wrong? (optional, no links)",
    phPrice: "e.g. The Pro plan is now $79/month", phOther: "e.g. The hosted endpoint returns an error", sending: "Sending…", send: "Send report",
  },
  follow: {
    title: (n: string) => `Follow ${n}`, sub: "Free alerts · no account",
    text: (n: string) => `Get an email when ${n} changes its price or plans. Our robots check it for you.`,
    email: "Your email", btn: "Get alerts", sending: "Sending…", publisher: (n: string) => `I built ${n} (I'm the publisher)`,
    program: "Join the free Publisher Program", yes: "Yes, add me. Unsubscribe in one click.", either: "Alerts work either way. The program never changes a score.",
    never: "Your email is never published or shared.", privacy: "Privacy",
    msg: {
      ok: "Done. We will email you when our robots detect a change on this page.",
      ok_program: "Done. You will get alerts for this page, and you are in the free Publisher Program.",
      rate_limited: "Too many requests from your connection right now. Please try again later.",
      invalid: "Please enter a valid email address.", error: "Something went wrong. Please try again later.",
    } as Record<string, string>,
    benefits: [
      ["Monthly report", ": how many visitors clicked from Electra Index to your site."],
      ["Founding pilot", ": free live testing of your agent for the first 10 publishers, results published on your page."],
      ["Priority booking", " of ad slots on Electra Index (clearly marked as ads, never inside rankings)."],
    ],
  },
};
export type BoxDict = typeof boxEn;

const boxFr: BoxDict = {
  status: { new: "NOUVEAU", updated: "Mis à jour", official: "✓ Source officielle vérifiée", recheckDue: "À revérifier · vérifié", lastVerified: "Vérifié" },
  sponsored: "Sponsorisé", learnMore: "En savoir plus",
  affiliate: "Lien d'affiliation : Electra Index peut toucher une commission si vous vous abonnez, sans surcoût pour vous. Cela ne change jamais les scores ni les classements.", neutral: "Comment nous restons neutres",
  share: "Partager :", copyLink: "Copier le lien", copied: "Lien copié",
  shareAgent: (n, u) => `${n} est désormais référencé sur Electra Index, l'index indépendant des agents IA avec prix vérifiés et classements. Voyez où il se situe : ${u} #AgentsIA`,
  kitTitle: (n) => `Vous êtes l'éditeur de ${n} ?`, kitSub: "Gratuit · montrez votre fiche",
  kitText: "Une fiche indépendante renforce la confiance de vos clients. Annoncez-la et ajoutez le badge sur votre site ou votre README.",
  kitLinkedIn: "L'annoncer sur LinkedIn", copyHtml: "Copier le HTML", copyMd: "Copier le Markdown", copiedShort: "Copié",
  report: {
    title: "Cette page est-elle exacte ?", sub: "Signalez-le et notre robot revérifie la source officielle. Un signalement ne change jamais un score.",
    kinds: { price_wrong: "Le prix est faux", info_outdated: "Info dépassée", not_working: "Ne fonctionne pas", broken_link: "Lien cassé", other: "Autre chose" },
    msg: {
      ok: "Merci. Votre signalement est enregistré et notre robot va revérifier la source officielle. Un signalement ne change jamais un score.",
      already_reported: "Vous l'avez déjà signalé aujourd'hui. Merci, c'est dans la file.",
      links_not_allowed: "Merci de retirer les liens de votre note et de renvoyer.",
      rate_limited: "Trop de signalements depuis votre connexion pour le moment. Réessayez plus tard.",
      invalid: "Ce signalement n'a pas pu être enregistré.", error: "Une erreur s'est produite. Réessayez plus tard.",
    },
    underReview: "Signalement reçu · en cours de vérification",
    received: (n) => `${n} signalement${n > 1 ? "s" : ""} reçu${n > 1 ? "s" : ""} · revérification prévue`,
    rechecked: (ago) => `✓ Revérifié ${ago} après un signalement : toujours conforme à la source officielle`,
    whatWrong: "Qu'est-ce qui ne va pas ?", note: "Qu'est-ce qui ne va pas ? (facultatif, sans lien)",
    phPrice: "ex. : l'offre Pro est maintenant à 79 $/mois", phOther: "ex. : le service hébergé renvoie une erreur", sending: "Envoi…", send: "Envoyer",
  },
  follow: {
    title: (n) => `Suivre ${n}`, sub: "Alertes gratuites · sans compte",
    text: (n) => `Recevez un e-mail quand ${n} change ses prix ou ses offres. Nos robots surveillent pour vous.`,
    email: "Votre e-mail", btn: "Recevoir les alertes", sending: "Envoi…", publisher: (n) => `J'ai créé ${n} (je suis l'éditeur)`,
    program: "Rejoindre le Publisher Program gratuit", yes: "Oui, inscrivez-moi. Désinscription en un clic.", either: "Les alertes fonctionnent dans tous les cas. Le programme ne change jamais un score.",
    never: "Votre e-mail n'est jamais publié ni partagé.", privacy: "Confidentialité",
    msg: {
      ok: "C'est fait. Nous vous écrirons dès que nos robots détectent un changement sur cette page.",
      ok_program: "C'est fait. Vous recevrez les alertes de cette page, et vous faites partie du Publisher Program gratuit.",
      rate_limited: "Trop de demandes depuis votre connexion pour le moment. Réessayez plus tard.",
      invalid: "Merci d'indiquer une adresse e-mail valide.", error: "Une erreur s'est produite. Réessayez plus tard.",
    },
    benefits: [
      ["Rapport mensuel", " : combien de visiteurs ont cliqué depuis Electra Index vers votre site."],
      ["Pilote fondateur", " : test en conditions réelles gratuit de votre agent pour les 10 premiers éditeurs, résultats publiés sur votre fiche."],
      ["Réservation prioritaire", " des emplacements publicitaires sur Electra Index (toujours signalés comme publicité, jamais dans les classements)."],
    ],
  },
};
export function boxT(lang: Lang): BoxDict { return lang === "fr" ? boxFr : boxEn; }
