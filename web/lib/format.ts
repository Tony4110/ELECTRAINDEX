import type { Lang } from "@/lib/i18n";

export function timeAgo(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (lang === "fr") {
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`;
    return `le ${shortDate(iso, "fr")}`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function num(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-US").format(n);
}

export function shortDate(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function show(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("amount" in o) return `${o.amount ?? "quote"} ${o.currency ?? ""}${o.interval ? "/" + o.interval : ""}`.trim();
    return JSON.stringify(v);
  }
  return String(v);
}

export const EVENT_LABEL: Record<string, string> = {
  new_entity: "NEW",
  new_version: "VERSION",
  field_changed: "CHANGED",
  protocol_added: "PROTOCOL +",
  protocol_removed: "PROTOCOL −",
  price_increase: "PRICE ▲",
  price_decrease: "PRICE ▼",
  plan_added: "NEW PLAN",
  went_offline: "OFFLINE",
  back_online: "ONLINE",
  capability_added: "CAPABILITY +",
  discontinued: "DISCONTINUED",
};

const EVENT_LABEL_FR: Record<string, string> = {
  new_entity: "NOUVEAU", new_version: "VERSION", field_changed: "MODIFIÉ", protocol_added: "PROTOCOLE +", protocol_removed: "PROTOCOLE −",
  price_increase: "PRIX ▲", price_decrease: "PRIX ▼", plan_added: "NOUVELLE OFFRE", went_offline: "HORS LIGNE", back_online: "EN LIGNE",
  capability_added: "FONCTIONNALITÉ +", discontinued: "ARRÊTÉ",
};
export function eventLabel(t: string, lang: Lang = "en") { return (lang === "fr" ? EVENT_LABEL_FR[t] : EVENT_LABEL[t]) ?? t.toUpperCase(); }

export function eventTone(t: string): "pos" | "warn" | "neg" | "accent" | "plain" {
  if (t === "price_decrease" || t === "back_online") return "pos";
  if (t === "price_increase") return "warn";
  if (t === "went_offline" || t === "discontinued") return "neg";
  if (t === "protocol_added" || t === "capability_added" || t === "new_entity") return "accent";
  return "plain";
}

export function describeSignal(s: { event_type: string; field: string | null; old_value: unknown; new_value: unknown }, lang: Lang = "en"): string {
  switch (s.event_type) {
    case "new_entity": return lang === "fr" ? "première apparition dans l'index" : "first seen in the index";
    case "new_version": return `${show(s.old_value)} → ${show(s.new_value)}`;
    case "field_changed": {
      const f = s.field === "transport.remote" ? "remote access" : s.field === "transport.local" ? "local install" : s.field ?? "field";
      return `${f}: ${show(s.old_value)} → ${show(s.new_value)}`;
    }
    default: return s.field ? `${s.field}: ${show(s.old_value)} → ${show(s.new_value)}` : show(s.new_value);
  }
}

/** "SEO Optimization" → "SEO optimization", "Knowledge Base QA" → "knowledge base QA" (acronyms kept). */
export const useCase = (s: string) => s.split(" ").map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase())).join(" ");
