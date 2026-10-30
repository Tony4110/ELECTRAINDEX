import { db } from "@/lib/db";

/** AI apps: consumer AI apps, kept apart from the agent, task and MCP rankings. */
export type AppCard = {
  id: string; slug: string; name: string; short_description: string | null; website: string | null;
  last_verified_at: string | null; first_seen_at: string; company: string | null; country: string | null;
  theme: string | null; platforms: string[] | null; privacy_url: string | null; pricing_url: string | null;
  from_usd_month: number | null; has_free: boolean;
};
export type AppPrice = { plan_name: string; billing_model: string; amount: number | null; currency: string | null; interval: string | null; unit: string | null; is_trial: boolean; observed_at: string };

export const APP_THEMES: { slug: string; name: string; title: string; intro: string }[] = [
  { slug: "coaching", name: "Coaching & personal growth", title: "AI coaching apps", intro: "AI apps that coach you on confidence, communication, interviews or habits." },
  { slug: "wellbeing", name: "Wellbeing & journaling", title: "AI journaling and wellbeing apps", intro: "AI journals and wellbeing companions for reflection and daily routines. Not medical or therapy services." },
  { slug: "learning", name: "Learning & languages", title: "AI language and learning apps", intro: "AI tutors and conversation partners for languages and new skills." },
  { slug: "creativity", name: "Creativity: photo, art, music", title: "AI photo, art and music apps", intro: "AI apps that edit photos, create images or compose music." },
  { slug: "accessibility", name: "Accessibility", title: "AI accessibility apps", intro: "AI apps that read text aloud, describe the world or give a voice to people who cannot speak." },
  { slug: "entertainment", name: "Entertainment & chat", title: "AI entertainment and chat apps", intro: "AI characters, storytelling, games and readings, for fun." },
];
export const appTheme = (slug: string | null | undefined) => APP_THEMES.find((t) => t.slug === slug) ?? null;

export const PLATFORM: Record<string, string> = { web: "Web", ios: "iPhone", android: "Android", mac: "Mac", windows: "Windows" };

export async function loadApps(theme?: string) {
  const c = db();
  if (!c) return null;
  let q = c.from("v_apps").select("*").order("name");
  if (theme) q = q.eq("theme", theme);
  const { data } = await q.limit(500);
  return (data as AppCard[] | null) ?? [];
}

export async function loadApp(slug: string) {
  const c = db();
  if (!c) return null;
  const [{ data: a }, { data: p }] = await Promise.all([
    c.from("v_apps").select("*").eq("slug", slug).maybeSingle(),
    c.from("v_app_prices").select("*").eq("app_slug", slug).order("amount", { ascending: true, nullsFirst: true }),
  ]);
  if (!a) return null;
  return { app: a as AppCard, prices: (p as AppPrice[] | null) ?? [] };
}

export function money(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  if (Number(amount) === 0) return "Free";
  const n = Number(amount) % 1 === 0 ? Number(amount).toFixed(0) : Number(amount).toFixed(2);
  return currency === "USD" || !currency ? `$${n}` : currency === "EUR" ? `€${n}` : currency === "GBP" ? `£${n}` : `${n} ${currency}`;
}
export const per = (i: string | null) => (i === "month" ? "/month" : i === "year" ? "/year" : i === "one_time" ? " once" : "");
