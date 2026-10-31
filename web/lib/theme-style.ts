/** Colour and one-line promise per theme, shared by the friendlier listing pages. */
export const THEME_STYLE: Record<string, { color: string; soft: string; en: string; fr: string }> = {
  coding:                 { color: "#2F6BFF", soft: "#E6EEFF", en: "Write, review and fix code", fr: "Écrire, relire et corriger du code" },
  research:               { color: "#7C4DFF", soft: "#EFE9FF", en: "Find, read and summarise information", fr: "Trouver, lire et résumer l'information" },
  "customer-support":     { color: "#0EA5A4", soft: "#E0F6F5", en: "Answer your customers, day and night", fr: "Répondre à vos clients, jour et nuit" },
  sales:                  { color: "#F28C28", soft: "#FDEBDA", en: "Find leads and close deals", fr: "Trouver des prospects et conclure des ventes" },
  marketing:              { color: "#E0457B", soft: "#FCE6EE", en: "Create content and grow your audience", fr: "Créer du contenu et développer votre audience" },
  productivity:           { color: "#16A34A", soft: "#E1F5E8", en: "Save hours on everyday work", fr: "Gagner des heures sur le travail quotidien" },
  data:                   { color: "#4F46E5", soft: "#E8E7FC", en: "Collect, clean and analyse data", fr: "Collecter, nettoyer et analyser des données" },
  finance:                { color: "#0F766E", soft: "#DDF1EE", en: "Handle invoices, payments and reports", fr: "Gérer factures, paiements et rapports" },
  "browser-computer-use": { color: "#0891B2", soft: "#DFF3F8", en: "Let an agent use websites and apps for you", fr: "Un agent qui utilise sites et applis pour vous" },
  "business-operations":  { color: "#B7791F", soft: "#F8EEDC", en: "Run the back office", fr: "Faire tourner l'administratif" },
};
export const THEME_ORDER = ["coding", "research", "customer-support", "sales", "marketing", "productivity", "data", "finance", "browser-computer-use", "business-operations"];
export const themeStyle = (slug: string | null | undefined) => THEME_STYLE[slug ?? ""] ?? { color: "#56615C", soft: "#ECEFEA", en: "", fr: "" };
