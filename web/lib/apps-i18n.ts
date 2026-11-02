import { db } from "@/lib/db";
import type { Lang } from "@/lib/i18n";

export const APP_THEMES_FR: Record<string, { name: string; title: string; intro: string }> = {
  coaching: { name: "Coaching et développement", title: "Apps de coaching IA", intro: "Des apps IA qui vous coachent sur l'assurance, la prise de parole, les entretiens ou les habitudes." },
  wellbeing: { name: "Bien-être et journal", title: "Apps IA de journal et de bien-être", intro: "Journaux et compagnons IA pour la réflexion et les routines du quotidien. Ni soins médicaux ni thérapie." },
  learning: { name: "Langues et apprentissage", title: "Apps IA pour apprendre les langues", intro: "Tuteurs IA et partenaires de conversation pour les langues et les nouvelles compétences." },
  creativity: { name: "Créativité : photo, art, musique", title: "Apps IA de photo, d'art et de musique", intro: "Des apps IA qui retouchent les photos, créent des images ou composent de la musique." },
  accessibility: { name: "Accessibilité", title: "Apps IA d'accessibilité", intro: "Des apps IA qui lisent les textes à voix haute, décrivent le monde ou donnent une voix aux personnes qui ne peuvent pas parler." },
  design: { name: "Design et e-commerce", title: "Apps IA de design pour marques et vendeurs en ligne", intro: "Des apps IA pour les emballages, étiquettes, logos, photos produits et visuels marketing." },
  entertainment: { name: "Divertissement et conversation", title: "Apps IA de divertissement et de conversation", intro: "Personnages IA, histoires interactives, jeux et lectures, pour le plaisir." },
};

/** Text of the AI apps pages, per language. */
export const APPS_T = {
  en: {
    eyebrow: "AI apps", h1: "AI apps for everyday life", submit: "Submit your app, free →", all: "All",
    lede: "Coaching, journaling, languages, photos, music, accessibility, design. For each app: who publishes it, where it runs and what it really costs, checked on its official pages.",
    empty: "No app yet", emptyBody: "Apps appear here once their official pages have been read.",
    note: "AI apps are listed apart from AI agents and never enter the agent rankings. Every app shown has an identifiable publisher, a public price (or a free plan) and a privacy policy. Prices are read on the official pricing page or app store listing, with the date.",
    themeNote: "Listed alphabetically: AI apps are not scored or ranked. Every app shown has an identifiable publisher, a public price (or a free plan) and a privacy policy.",
    nApps: (n: number) => `${n} apps, with publisher, platforms and prices read on their official pages.`,
    app: "AI app", site: "Official website →", pricingPage: "Pricing page →", plans: "Plans and prices", noPrice: "No price published on the official page yet.",
    th: ["Plan", "Price", "Read on"], trial: "trial", facts: "Facts", publisher: "Publisher", on: "Available on", freePlan: "Free plan", yes: "Yes", no: "No",
    privacy: "Privacy policy", read: "Read it →", checked: "Last checked", alts: (n: string) => `Alternatives to ${n}`, allIn: (t: string) => `All ${t.toLowerCase()} apps →`,
    pageNote: "AI apps are listed apart from AI agents: they are not scored or ranked. Facts and prices are read on the publisher's official pages, with the date. Something wrong? Write to contact@electraindex.com.",
    free: "Free", per: { month: "/month", year: "/year", one_time: " once" } as Record<string, string>,
  },
  fr: {
    eyebrow: "Apps IA", h1: "Les apps IA du quotidien", submit: "Proposer votre app, gratuit →", all: "Toutes",
    lede: "Coaching, journal, langues, photos, musique, accessibilité, design. Pour chaque app : qui l'édite, où elle fonctionne et ce qu'elle coûte vraiment, vérifié sur ses pages officielles.",
    empty: "Aucune app pour l'instant", emptyBody: "Les apps apparaissent ici dès que leurs pages officielles ont été lues.",
    note: "Les apps IA sont présentées à part des agents IA et n'entrent jamais dans leurs classements. Chaque app affichée a un éditeur identifiable, un prix public (ou un plan gratuit) et une politique de confidentialité. Les prix sont lus sur la page tarifs officielle ou la fiche App Store, avec la date.",
    themeNote: "Par ordre alphabétique : les apps IA ne sont ni notées ni classées. Chaque app affichée a un éditeur identifiable, un prix public (ou un plan gratuit) et une politique de confidentialité.",
    nApps: (n: number) => `${n} apps, avec éditeur, plateformes et prix lus sur leurs pages officielles.`,
    app: "App IA", site: "Site officiel →", pricingPage: "Page tarifs →", plans: "Formules et prix", noPrice: "Aucun prix publié sur la page officielle pour l'instant.",
    th: ["Formule", "Prix", "Lu le"], trial: "essai", facts: "En bref", publisher: "Éditeur", on: "Disponible sur", freePlan: "Plan gratuit", yes: "Oui", no: "Non",
    privacy: "Confidentialité", read: "La lire →", checked: "Vérifié le", alts: (n: string) => `Alternatives à ${n}`, allIn: (t: string) => `Toutes les apps « ${t} » →`,
    pageNote: "Les apps IA sont présentées à part des agents IA : elles ne sont ni notées ni classées. Faits et prix sont lus sur les pages officielles de l'éditeur, avec la date. Une erreur ? Écrivez à contact@electraindex.com.",
    free: "Gratuit", per: { month: "/mois", year: "/an", one_time: " une fois" } as Record<string, string>,
  },
};
export const appsT = (lang: Lang) => (lang === "fr" ? APPS_T.fr : APPS_T.en);

/** French descriptions (slug → text). Empty in English. */
export async function loadAppTexts(lang: Lang): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (lang === "en") return m;
  const c = db();
  if (!c) return m;
  const { data, error } = await c.from("v_app_i18n").select("slug,short_description").eq("lang", lang);
  if (!error) for (const r of (data as { slug: string; short_description: string }[] | null) ?? []) m.set(r.slug, r.short_description);
  return m;
}
