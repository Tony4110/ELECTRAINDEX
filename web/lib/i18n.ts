/**
 * Languages of Electra Index. English lives at the root (/pricing); the others under a prefix (/fr/pricing).
 * Only the pages listed in LOCALIZED exist in every language; every other link stays in English.
 */
export const LANGS = ["en", "fr", "es", "de"] as const;
export type Lang = (typeof LANGS)[number];
export const OTHER_LANGS = ["fr", "es", "de"] as const;
export const LANG_NAMES: Record<Lang, string> = { en: "English", fr: "Français", es: "Español", de: "Deutsch" };
export const OG_LOCALE: Record<Lang, string> = { en: "en_US", fr: "fr_FR", es: "es_ES", de: "de_DE" };

/** Pages available in every language (step by step). */
export const LOCALIZED = ["/", "/submit"];

export function isLang(x: string | undefined | null): x is Lang {
  return !!x && (LANGS as readonly string[]).includes(x);
}

/** Language of a pathname: /fr/... -> fr, anything else -> en */
export function langOfPath(path: string): Lang {
  const seg = path.split("/")[1];
  return isLang(seg) ? seg : "en";
}

/** Path without its language prefix: /fr/submit -> /submit, /fr -> / */
export function stripLang(path: string): string {
  const l = langOfPath(path);
  if (l === "en") return path || "/";
  const rest = path.slice(l.length + 1);
  return rest === "" ? "/" : rest;
}

function baseOf(path: string) {
  return path.split(/[?#]/)[0] || "/";
}

/** Link to a page in a language: localized pages get the prefix, the others stay in English. */
export function lhref(lang: Lang, path: string): string {
  if (lang === "en") return path;
  const base = baseOf(path);
  if (!LOCALIZED.includes(base)) return path;
  const suffix = path.slice(base.length);
  return `/${lang}${base === "/" ? "" : base}${suffix}`;
}

/** hreflang alternates for a localized page (metadata.alternates). */
/** false = FR/ES/DE are hidden from Google (noindex, no hreflang, not in sitemap) until the whole site is translated. */
export const I18N_PUBLIC = false;
export const I18N_ROBOTS = I18N_PUBLIC ? undefined : { index: false, follow: true };

export function alternatesFor(path: string, lang: Lang) {
  if (!I18N_PUBLIC) return { canonical: lhref(lang, path) };
  const languages: Record<string, string> = { "x-default": path };
  for (const l of LANGS) languages[l] = lhref(l, path);
  return { canonical: lhref(lang, path), languages };
}

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------
const THEMES_FR: Record<string, string> = {
  coding: "Développement", research: "Recherche", "customer-support": "Support client", sales: "Ventes", marketing: "Marketing",
  productivity: "Productivité", data: "Données", finance: "Finance", "browser-computer-use": "Navigateur et ordinateur", "business-operations": "Opérations",
};
const THEMES_ES: Record<string, string> = {
  coding: "Programación", research: "Investigación", "customer-support": "Atención al cliente", sales: "Ventas", marketing: "Marketing",
  productivity: "Productividad", data: "Datos", finance: "Finanzas", "browser-computer-use": "Navegador y ordenador", "business-operations": "Operaciones",
};
const THEMES_DE: Record<string, string> = {
  coding: "Programmierung", research: "Recherche", "customer-support": "Kundensupport", sales: "Vertrieb", marketing: "Marketing",
  productivity: "Produktivität", data: "Daten", finance: "Finanzen", "browser-computer-use": "Browser & Computer", "business-operations": "Betrieb",
};

const en = {
  nav: { agents: "Agents", tasks: "Tasks", tools: "Tools", compare: "Compare", payments: "Payments", new: "New", pulse: "Pulse", pricing: "Pricing", blog: "Blog", methodology: "Methodology", list: "List your agent" },
  footer: {
    tagline: "the trust layer for the agent economy", sourced: "Every fact has a source and a date · no source → no claim",
    scores: "Scores measure observable public data, not performance", advertise: "Advertise", publishedBy: "Published by", estonia: "(Estonia)",
    contact: "Contact", privacy: "Privacy", mcpServer: "MCP server", pricing: "Pricing",
  },
  rank: {
    perMonth: "/mo", freePlanShort: "free plan", freePlan: "Free plan", onQuote: "On quote", noPrice: "No price published",
    verified: "✓ VERIFIED", verifiedTitle: "Verified by our robots", declared: "DECLARED", declaredTitle: "Declared by the publisher, not yet verified by us",
    proven: "✓✓ PROVEN", provenTitle: "Proven: measured over time",
    value: { best: "BEST VALUE", premium: "PREMIUM", free: "FREE PLAN", fair: "FAIR" },
  },
  themes: {} as Record<string, string>,
  home: {
    metaTitle: "Electra Index — The trust layer for the agent economy",
    metaDesc: "Know your agent. Trust your transaction. Electra Index ranks AI agents and the tools they use on quality, price and trust. Every fact sourced and dated.",
    h1: "Know your agent. Trust your transaction.", lede: "Which AI agent to use, whether it can be trusted, and what it really costs.",
    all: "All", bestFor: (t: string) => `Best AI agents for ${t}`, top: "Top AI agents",
    searchLabel: "What do you need an AI agent to do?", searchPh: "What do you need done?", searchBtn: "Search",
    sortBy: "Sort by", quality: "Quality", bestValue: "Best value", lowestPrice: "Lowest price", tasksN: (n: number) => `${n} tasks:`,
    emptyTitle: "No agent yet", emptyBody: "Agents appear here once their vendor page has been read.",
    th: { agent: "Agent", theme: "Theme", quality: "Quality", from: "From", value: "Value", trust: "Trust" },
    fullRanking: (t: string) => `Full ${t} ranking with task coverage and tools →`,
    note: "Quality = Agent Score (0–100). Prices are read on each vendor's pricing page and dated. No paid placement: a commercial partnership never changes a score.",
    methodology: "Methodology", weekTitle: "This week in the agent economy", pulse: "Weekly Pulse →",
    signalsEmpty: "Changes appear here as soon as a robot detects them.", signalsEmptyTitle: "No signals yet",
    signalsOther: "",
    stats: { agents: "AI agents ranked", tools: "tools tracked", tasks: "tasks", changes: "changes this week" },
  },
  submit: {
    metaTitle: "List your AI agent", metaDesc: "Submit your AI agent or tool to Electra Index. Free. A listing never changes a score.",
    eyebrow: "List your agent", h1: "List your AI agent",
    lede: "Free. We read your public pages, source every fact, and list your agent with its price and score. A listing or a partnership never changes a score.",
    mcpNote1: "Listing an MCP server? Publish it on the", mcpNote2: "Official MCP Registry", mcpNote3: ": our robot lists every registry server automatically, usually within 15 minutes. Use this form for AI agents and for tools that are not in the registry.",
    errSetup: "The site is not connected yet. Please try again later.", errInvalid: "Please check the form: a name, a valid website (https://…) and a valid email are required.",
    what: "What are you listing?", kindAgent: "AI agent (a product people use)", kindTool: "Tool / MCP server (used by agents)",
    name: "Name *", namePh: "e.g. Acme Sales Agent", website: "Website *", pricing: "Pricing page", theme: "Theme", chooseTheme: "Choose a theme",
    email: "Your email *", emailNote: "Used to contact you about this listing. Never published.", privacy: "Privacy",
    desc: "What does it do? (one or two sentences)", descPh: "e.g. Finds B2B leads, enriches them and sends personalised outreach.",
    programTitle: "Join the free Publisher Program",
    benefits: [
      ["Monthly report", ": how many visitors clicked from Electra Index to your site."],
      ["Founding pilot", ": free live testing of your agent for the first 10 publishers, results published on your page."],
      ["Priority booking", " of ad slots on Electra Index (clearly marked as ads, never inside rankings)."],
    ] as [string, string][],
    optIn: "Yes, add me. Unsubscribe in one click.", optional: "Optional: your listing is free and reviewed the same way either way. The program never changes a score.",
    button: "Submit for listing →",
    next: "What happens next: we check that the website and pricing page are public, our robots extract the facts, and the agent is listed with a \"Declared\" trust level until verified.",
    okH1: "Thank you. We received it.",
    okLede: "We check every submission against the index, then read your website and pricing page. Once the facts are sourced, your agent appears in New listings and in its theme ranking. We use your email about this listing, and for the Publisher Program only if you joined it.",
    okNew: "See new listings →", okBack: "Back to the ranking",
  },
};
export type Dict = typeof en;

const fr: Dict = {
  nav: { agents: "Agents", tasks: "Tâches", tools: "Outils", compare: "Comparer", payments: "Paiements", new: "Nouveautés", pulse: "Pulse", pricing: "Tarifs", blog: "Blog", methodology: "Méthodologie", list: "Lister votre agent" },
  footer: {
    tagline: "la couche de confiance de l'économie des agents", sourced: "Chaque fait a une source et une date · pas de source, pas d'affirmation",
    scores: "Les scores mesurent des données publiques observables, pas la performance", advertise: "Publicité", publishedBy: "Publié par", estonia: "(Estonie)",
    contact: "Contact", privacy: "Confidentialité", mcpServer: "Serveur MCP", pricing: "Tarifs",
  },
  rank: {
    perMonth: "/mois", freePlanShort: "offre gratuite", freePlan: "Offre gratuite", onQuote: "Sur devis", noPrice: "Aucun prix publié",
    verified: "✓ VÉRIFIÉ", verifiedTitle: "Vérifié par nos robots", declared: "DÉCLARÉ", declaredTitle: "Déclaré par l'éditeur, pas encore vérifié par nous",
    proven: "✓✓ PROUVÉ", provenTitle: "Prouvé : mesuré dans le temps",
    value: { best: "MEILLEUR RAPPORT", premium: "PREMIUM", free: "GRATUIT", fair: "CORRECT" },
  },
  themes: THEMES_FR,
  home: {
    metaTitle: "Electra Index — La couche de confiance de l'économie des agents IA",
    metaDesc: "Connaissez votre agent. Faites confiance à votre transaction. Electra Index classe les agents IA et leurs outils selon la qualité, le prix et la confiance. Chaque fait est sourcé et daté.",
    h1: "Connaissez votre agent. Faites confiance à votre transaction.", lede: "Quel agent IA utiliser, peut-on lui faire confiance, et combien coûte-t-il vraiment.",
    all: "Tous", bestFor: (t: string) => `Meilleurs agents IA : ${t}`, top: "Meilleurs agents IA",
    searchLabel: "Que voulez-vous confier à un agent IA ?", searchPh: "Que voulez-vous faire ?", searchBtn: "Rechercher",
    sortBy: "Trier par", quality: "Qualité", bestValue: "Rapport qualité-prix", lowestPrice: "Prix le plus bas", tasksN: (n: number) => `${n} tâches :`,
    emptyTitle: "Aucun agent pour l'instant", emptyBody: "Les agents apparaissent ici dès que la page de l'éditeur a été lue.",
    th: { agent: "Agent", theme: "Thème", quality: "Qualité", from: "À partir de", value: "Rapport", trust: "Confiance" },
    fullRanking: (t: string) => `Classement complet ${t}, avec couverture des tâches et outils →`,
    note: "Qualité = Agent Score (0–100). Les prix sont relevés sur la page tarifaire de chaque éditeur et datés. Aucun placement payant : un partenariat commercial ne change jamais un score.",
    methodology: "Méthodologie", weekTitle: "Cette semaine dans l'économie des agents", pulse: "Pulse hebdomadaire →",
    signalsEmpty: "", signalsEmptyTitle: "",
    signalsOther: "Chaque semaine, le Pulse résume les nouveaux agents, les nouveaux serveurs MCP et les changements de prix détectés par nos robots (en anglais).",
    stats: { agents: "agents IA classés", tools: "outils suivis", tasks: "tâches", changes: "changements cette semaine" },
  },
  submit: {
    metaTitle: "Lister votre agent IA", metaDesc: "Proposez votre agent IA ou votre outil à Electra Index. Gratuit. Un référencement ne change jamais un score.",
    eyebrow: "Lister votre agent", h1: "Lister votre agent IA",
    lede: "Gratuit. Nous lisons vos pages publiques, sourçons chaque fait et listons votre agent avec son prix et son score. Un référencement ou un partenariat ne change jamais un score.",
    mcpNote1: "Vous publiez un serveur MCP ? Publiez-le sur le", mcpNote2: "registre officiel MCP", mcpNote3: " : notre robot liste automatiquement chaque serveur du registre, en général en 15 minutes. Utilisez ce formulaire pour les agents IA et les outils absents du registre.",
    errSetup: "Le site n'est pas encore connecté. Merci de réessayer plus tard.", errInvalid: "Merci de vérifier le formulaire : un nom, un site valide (https://…) et un e-mail valide sont requis.",
    what: "Que proposez-vous ?", kindAgent: "Agent IA (un produit utilisé par des personnes)", kindTool: "Outil / serveur MCP (utilisé par des agents)",
    name: "Nom *", namePh: "ex. Acme Sales Agent", website: "Site web *", pricing: "Page des tarifs", theme: "Thème", chooseTheme: "Choisir un thème",
    email: "Votre e-mail *", emailNote: "Utilisé pour vous contacter au sujet de ce référencement. Jamais publié.", privacy: "Confidentialité",
    desc: "Que fait-il ? (une ou deux phrases)", descPh: "ex. Trouve des prospects B2B, les enrichit et envoie des messages personnalisés.",
    programTitle: "Rejoignez le Publisher Program gratuit",
    benefits: [
      ["Rapport mensuel", " : combien de visiteurs ont cliqué depuis Electra Index vers votre site."],
      ["Pilote fondateur", " : test en ligne gratuit de votre agent pour les 10 premiers éditeurs, résultats publiés sur votre page."],
      ["Réservation prioritaire", " des emplacements publicitaires sur Electra Index (toujours signalés comme publicité, jamais dans les classements)."],
    ],
    optIn: "Oui, ajoutez-moi. Désinscription en un clic.", optional: "Facultatif : votre référencement est gratuit et étudié de la même façon dans tous les cas. Le programme ne change jamais un score.",
    button: "Envoyer pour référencement →",
    next: "Et ensuite : nous vérifions que le site et la page des tarifs sont publics, nos robots extraient les faits, et l'agent est listé avec le niveau de confiance « Déclaré » jusqu'à vérification.",
    okH1: "Merci, nous l'avons bien reçu.",
    okLede: "Nous comparons chaque demande à l'index, puis lisons votre site et votre page des tarifs. Une fois les faits sourcés, votre agent apparaît dans les nouveautés et dans le classement de son thème. Nous utilisons votre e-mail pour ce référencement, et pour le Publisher Program seulement si vous l'avez rejoint.",
    okNew: "Voir les nouveautés →", okBack: "Retour au classement",
  },
};

const es: Dict = {
  nav: { agents: "Agentes", tasks: "Tareas", tools: "Herramientas", compare: "Comparar", payments: "Pagos", new: "Novedades", pulse: "Pulse", pricing: "Precios", blog: "Blog", methodology: "Metodología", list: "Añade tu agente" },
  footer: {
    tagline: "la capa de confianza de la economía de los agentes", sourced: "Cada dato tiene una fuente y una fecha · sin fuente, no hay afirmación",
    scores: "Las puntuaciones miden datos públicos observables, no el rendimiento", advertise: "Publicidad", publishedBy: "Publicado por", estonia: "(Estonia)",
    contact: "Contacto", privacy: "Privacidad", mcpServer: "Servidor MCP", pricing: "Precios",
  },
  rank: {
    perMonth: "/mes", freePlanShort: "plan gratuito", freePlan: "Plan gratuito", onQuote: "Bajo presupuesto", noPrice: "Sin precio publicado",
    verified: "✓ VERIFICADO", verifiedTitle: "Verificado por nuestros robots", declared: "DECLARADO", declaredTitle: "Declarado por el editor, aún no verificado por nosotros",
    proven: "✓✓ PROBADO", provenTitle: "Probado: medido a lo largo del tiempo",
    value: { best: "MEJOR VALOR", premium: "PREMIUM", free: "GRATIS", fair: "CORRECTO" },
  },
  themes: THEMES_ES,
  home: {
    metaTitle: "Electra Index — La capa de confianza de la economía de los agentes de IA",
    metaDesc: "Conoce a tu agente. Confía en tu transacción. Electra Index clasifica los agentes de IA y sus herramientas por calidad, precio y confianza. Cada dato con fuente y fecha.",
    h1: "Conoce a tu agente. Confía en tu transacción.", lede: "Qué agente de IA usar, si es fiable y cuánto cuesta realmente.",
    all: "Todos", bestFor: (t: string) => `Mejores agentes de IA: ${t}`, top: "Mejores agentes de IA",
    searchLabel: "¿Qué necesitas que haga un agente de IA?", searchPh: "¿Qué necesitas hacer?", searchBtn: "Buscar",
    sortBy: "Ordenar por", quality: "Calidad", bestValue: "Mejor valor", lowestPrice: "Precio más bajo", tasksN: (n: number) => `${n} tareas:`,
    emptyTitle: "Aún no hay agentes", emptyBody: "Los agentes aparecen aquí en cuanto se ha leído la página del editor.",
    th: { agent: "Agente", theme: "Tema", quality: "Calidad", from: "Desde", value: "Valor", trust: "Confianza" },
    fullRanking: (t: string) => `Clasificación completa de ${t}, con cobertura de tareas y herramientas →`,
    note: "Calidad = Agent Score (0–100). Los precios se leen en la página de precios de cada editor y se fechan. Sin posiciones pagadas: una colaboración comercial nunca cambia una puntuación.",
    methodology: "Metodología", weekTitle: "Esta semana en la economía de los agentes", pulse: "Pulse semanal →",
    signalsEmpty: "", signalsEmptyTitle: "",
    signalsOther: "Cada semana, el Pulse resume los nuevos agentes, los nuevos servidores MCP y los cambios de precio detectados por nuestros robots (en inglés).",
    stats: { agents: "agentes de IA clasificados", tools: "herramientas seguidas", tasks: "tareas", changes: "cambios esta semana" },
  },
  submit: {
    metaTitle: "Añade tu agente de IA", metaDesc: "Envía tu agente de IA o tu herramienta a Electra Index. Gratis. Aparecer en el índice nunca cambia una puntuación.",
    eyebrow: "Añade tu agente", h1: "Añade tu agente de IA",
    lede: "Gratis. Leemos tus páginas públicas, citamos la fuente de cada dato y listamos tu agente con su precio y su puntuación. Aparecer en el índice o una colaboración nunca cambia una puntuación.",
    mcpNote1: "¿Publicas un servidor MCP? Publícalo en el", mcpNote2: "registro oficial de MCP", mcpNote3: ": nuestro robot lista automáticamente cada servidor del registro, normalmente en 15 minutos. Usa este formulario para agentes de IA y herramientas que no están en el registro.",
    errSetup: "El sitio aún no está conectado. Inténtalo más tarde.", errInvalid: "Revisa el formulario: se necesita un nombre, un sitio web válido (https://…) y un correo válido.",
    what: "¿Qué quieres añadir?", kindAgent: "Agente de IA (un producto que usan las personas)", kindTool: "Herramienta / servidor MCP (usado por agentes)",
    name: "Nombre *", namePh: "p. ej. Acme Sales Agent", website: "Sitio web *", pricing: "Página de precios", theme: "Tema", chooseTheme: "Elige un tema",
    email: "Tu correo *", emailNote: "Para contactarte sobre esta ficha. Nunca se publica.", privacy: "Privacidad",
    desc: "¿Qué hace? (una o dos frases)", descPh: "p. ej. Encuentra clientes potenciales B2B, los enriquece y envía mensajes personalizados.",
    programTitle: "Únete al Publisher Program gratuito",
    benefits: [
      ["Informe mensual", ": cuántos visitantes hicieron clic desde Electra Index hacia tu sitio."],
      ["Piloto fundador", ": prueba en línea gratuita de tu agente para los 10 primeros editores, con resultados publicados en tu ficha."],
      ["Reserva prioritaria", " de espacios publicitarios en Electra Index (siempre señalados como anuncios, nunca dentro de las clasificaciones)."],
    ],
    optIn: "Sí, añádeme. Baja en un clic.", optional: "Opcional: tu ficha es gratuita y se revisa igual en ambos casos. El programa nunca cambia una puntuación.",
    button: "Enviar para su revisión →",
    next: "Qué pasa después: comprobamos que el sitio y la página de precios son públicos, nuestros robots extraen los datos y el agente se lista con el nivel de confianza «Declarado» hasta su verificación.",
    okH1: "Gracias, lo hemos recibido.",
    okLede: "Comparamos cada solicitud con el índice y luego leemos tu sitio y tu página de precios. Cuando los datos tienen fuente, tu agente aparece en Novedades y en la clasificación de su tema. Usamos tu correo para esta ficha, y para el Publisher Program solo si te has unido.",
    okNew: "Ver novedades →", okBack: "Volver a la clasificación",
  },
};

const de: Dict = {
  nav: { agents: "Agenten", tasks: "Aufgaben", tools: "Tools", compare: "Vergleichen", payments: "Zahlungen", new: "Neu", pulse: "Pulse", pricing: "Preise", blog: "Blog", methodology: "Methodik", list: "Agent eintragen" },
  footer: {
    tagline: "die Vertrauensebene der Agenten-Ökonomie", sourced: "Jede Angabe hat eine Quelle und ein Datum · keine Quelle, keine Behauptung",
    scores: "Scores messen beobachtbare öffentliche Daten, nicht die Leistung", advertise: "Werbung", publishedBy: "Herausgegeben von", estonia: "(Estland)",
    contact: "Kontakt", privacy: "Datenschutz", mcpServer: "MCP-Server", pricing: "Preise",
  },
  rank: {
    perMonth: "/Monat", freePlanShort: "Gratis-Plan", freePlan: "Gratis-Plan", onQuote: "Auf Anfrage", noPrice: "Kein Preis veröffentlicht",
    verified: "✓ GEPRÜFT", verifiedTitle: "Von unseren Robotern geprüft", declared: "ANGEGEBEN", declaredTitle: "Vom Anbieter angegeben, von uns noch nicht geprüft",
    proven: "✓✓ BEWÄHRT", provenTitle: "Bewährt: über längere Zeit gemessen",
    value: { best: "BESTER WERT", premium: "PREMIUM", free: "GRATIS", fair: "FAIR" },
  },
  themes: THEMES_DE,
  home: {
    metaTitle: "Electra Index — Die Vertrauensebene der KI-Agenten-Ökonomie",
    metaDesc: "Kenne deinen Agenten. Vertraue deiner Transaktion. Electra Index bewertet KI-Agenten und ihre Tools nach Qualität, Preis und Vertrauen. Jede Angabe mit Quelle und Datum.",
    h1: "Kenne deinen Agenten. Vertraue deiner Transaktion.", lede: "Welchen KI-Agenten du nutzen solltest, ob er vertrauenswürdig ist und was er wirklich kostet.",
    all: "Alle", bestFor: (t: string) => `Die besten KI-Agenten: ${t}`, top: "Die besten KI-Agenten",
    searchLabel: "Wobei soll dir ein KI-Agent helfen?", searchPh: "Was möchtest du erledigen?", searchBtn: "Suchen",
    sortBy: "Sortieren nach", quality: "Qualität", bestValue: "Bester Wert", lowestPrice: "Niedrigster Preis", tasksN: (n: number) => `${n} Aufgaben:`,
    emptyTitle: "Noch kein Agent", emptyBody: "Agenten erscheinen hier, sobald die Seite des Anbieters gelesen wurde.",
    th: { agent: "Agent", theme: "Thema", quality: "Qualität", from: "Ab", value: "Wert", trust: "Vertrauen" },
    fullRanking: (t: string) => `Vollständiges Ranking ${t} mit Aufgabenabdeckung und Tools →`,
    note: "Qualität = Agent Score (0–100). Preise werden auf der Preisseite jedes Anbieters gelesen und datiert. Keine bezahlten Platzierungen: Eine Geschäftsbeziehung ändert nie einen Score.",
    methodology: "Methodik", weekTitle: "Diese Woche in der Agenten-Ökonomie", pulse: "Wöchentlicher Pulse →",
    signalsEmpty: "", signalsEmptyTitle: "",
    signalsOther: "Jede Woche fasst der Pulse neue Agenten, neue MCP-Server und von unseren Robotern erkannte Preisänderungen zusammen (auf Englisch).",
    stats: { agents: "bewertete KI-Agenten", tools: "beobachtete Tools", tasks: "Aufgaben", changes: "Änderungen diese Woche" },
  },
  submit: {
    metaTitle: "KI-Agent eintragen", metaDesc: "Trage deinen KI-Agenten oder dein Tool bei Electra Index ein. Kostenlos. Ein Eintrag ändert nie einen Score.",
    eyebrow: "Agent eintragen", h1: "KI-Agent eintragen",
    lede: "Kostenlos. Wir lesen deine öffentlichen Seiten, belegen jede Angabe mit einer Quelle und listen deinen Agenten mit Preis und Score. Ein Eintrag oder eine Partnerschaft ändert nie einen Score.",
    mcpNote1: "Du veröffentlichst einen MCP-Server? Trage ihn in die", mcpNote2: "offizielle MCP-Registry", mcpNote3: " ein: Unser Roboter listet jeden Server der Registry automatisch, meist innerhalb von 15 Minuten. Nutze dieses Formular für KI-Agenten und Tools, die nicht in der Registry sind.",
    errSetup: "Die Seite ist noch nicht verbunden. Bitte versuche es später erneut.", errInvalid: "Bitte prüfe das Formular: Name, gültige Website (https://…) und gültige E-Mail sind erforderlich.",
    what: "Was möchtest du eintragen?", kindAgent: "KI-Agent (ein Produkt, das Menschen nutzen)", kindTool: "Tool / MCP-Server (von Agenten genutzt)",
    name: "Name *", namePh: "z. B. Acme Sales Agent", website: "Website *", pricing: "Preisseite", theme: "Thema", chooseTheme: "Thema wählen",
    email: "Deine E-Mail *", emailNote: "Nur für Rückfragen zu diesem Eintrag. Wird nie veröffentlicht.", privacy: "Datenschutz",
    desc: "Was macht er? (ein oder zwei Sätze)", descPh: "z. B. Findet B2B-Leads, reichert sie an und versendet personalisierte Nachrichten.",
    programTitle: "Tritt dem kostenlosen Publisher Program bei",
    benefits: [
      ["Monatlicher Bericht", ": wie viele Besucher von Electra Index auf deine Seite geklickt haben."],
      ["Gründer-Pilot", ": kostenloser Live-Test deines Agenten für die ersten 10 Anbieter, Ergebnisse auf deiner Seite veröffentlicht."],
      ["Vorrangige Buchung", " von Werbeplätzen auf Electra Index (immer als Werbung gekennzeichnet, nie in Rankings)."],
    ],
    optIn: "Ja, bitte eintragen. Abmeldung mit einem Klick.", optional: "Optional: Dein Eintrag ist kostenlos und wird in jedem Fall gleich geprüft. Das Programm ändert nie einen Score.",
    button: "Zur Prüfung einreichen →",
    next: "Wie es weitergeht: Wir prüfen, ob Website und Preisseite öffentlich sind, unsere Roboter erfassen die Fakten, und der Agent wird bis zur Prüfung mit der Vertrauensstufe „Angegeben“ gelistet.",
    okH1: "Danke, wir haben es erhalten.",
    okLede: "Wir gleichen jede Einreichung mit dem Index ab und lesen dann deine Website und Preisseite. Sobald die Fakten belegt sind, erscheint dein Agent unter „Neu“ und im Ranking seines Themas. Wir nutzen deine E-Mail für diesen Eintrag und für das Publisher Program nur, wenn du beigetreten bist.",
    okNew: "Neue Einträge ansehen →", okBack: "Zurück zum Ranking",
  },
};

const DICTS: Record<Lang, Dict> = { en, fr, es, de };
export function dict(lang: Lang): Dict { return DICTS[lang] ?? en; }

/** Theme name in a language (falls back to the English name from the database). */
export function themeName(lang: Lang, slug: string, english: string) {
  return dict(lang).themes[slug] ?? english;
}
