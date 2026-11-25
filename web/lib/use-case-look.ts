import type { CSSProperties } from "react";

/** Color and icon of each MCP use case, the same on the MCP Tools page, the use-case list and each use-case page. */
export type Look = { c: string; s: string; ink: string };

const BLUE: Look = { c: "var(--accent)", s: "var(--accent-soft)", ink: "var(--accent)" };
const GREEN: Look = { c: "var(--pos)", s: "var(--pos-soft)", ink: "var(--pos)" };
const SUN: Look = { c: "var(--sun)", s: "var(--sun-soft)", ink: "var(--sun-ink)" };
const EMBER: Look = { c: "var(--ember)", s: "var(--ember-soft)", ink: "var(--ember-ink)" };
const ORDER = [BLUE, GREEN, SUN, EMBER];

const FIXED: Record<string, Look> = {
  "social-media-management": BLUE, payments: GREEN, "document-understanding": SUN, "sql-querying": EMBER,
  invoicing: BLUE, "travel-booking": GREEN, "seo-optimization": SUN, "web-scraping": EMBER,
};

const ICON: Record<string, string> = {
  "social-media-management": "◎", payments: "$", "document-understanding": "▤", "sql-querying": "⌗", invoicing: "€",
  "travel-booking": "✈", "seo-optimization": "↗", "web-scraping": "⌘", "browser-automation": "⧉", "devops-automation": "⚙",
  "knowledge-base-qa": "?", "lead-generation": "◆", "e-commerce-management": "◫", "api-integration": "⇄", "calendar-management": "◷",
  "web-research": "⌕", "security-scanning": "◈", procurement: "▦",
};

export function capLook(slug: string): Look {
  if (FIXED[slug]) return FIXED[slug];
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ORDER[h % ORDER.length];
}

export function capIcon(slug: string, name: string): string {
  return ICON[slug] ?? name.charAt(0).toUpperCase();
}

/** CSS variables for an element styled with the use-case color (--c strong, --s soft, --k text). */
export function capVars(slug: string): CSSProperties {
  const l = capLook(slug);
  return { ["--c" as string]: l.c, ["--s" as string]: l.s, ["--k" as string]: l.ink } as CSSProperties;
}
