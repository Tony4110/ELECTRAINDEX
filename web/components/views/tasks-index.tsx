import Link from "next/link";
import { db, getTasks } from "@/lib/db";
import { SetupNotice } from "@/components/ui";
import { lhref, themeName, type Lang } from "@/lib/i18n";
import { TASKS_FR } from "@/lib/i18n-paths";
import { THEME_ORDER, themeStyle } from "@/lib/theme-style";
import { TasksBrowser, type TaskItem, type ThemeGroup } from "@/components/tasks-browser";

type Summary = { task_slug: string; agents_full: number; agents_any: number; top_agents: string[] | null; from_usd_month: number | null; has_free: boolean };

const COPY = {
  en: {
    eyebrow: "AI agents by task",
    h1: "What do you want an AI agent to do for you?",
    lede: "Pick a job below. We show you which AI agents can really do it, ranked by quality, with their real price.",
    steps: [["Pick a task", "From answering emails to reviewing code."], ["See who can do it", "Agents ranked by how much of the job they cover."], ["Compare and choose", "Price, quality and trust, checked on official pages."]],
    stat: (n: number, a: number) => `${n} tasks · ${a} AI agents checked`,
    foot: "How it works: each task needs a few capabilities (for example “read emails” and “write replies”). An agent appears when its official website says it has them. Full coverage first, then by Agent Score.",
    method: "Methodology",
  },
  fr: {
    eyebrow: "Agents IA par tâche",
    h1: "Que voulez-vous qu'un agent IA fasse pour vous ?",
    lede: "Choisissez une tâche ci-dessous. Nous vous montrons quels agents IA savent vraiment la faire, classés par qualité, avec leur vrai prix.",
    steps: [["Choisissez une tâche", "De répondre aux e-mails à relire du code."], ["Voyez qui sait la faire", "Les agents classés selon la part du travail qu'ils couvrent."], ["Comparez et choisissez", "Prix, qualité et confiance, vérifiés sur les sites officiels."]],
    stat: (n: number, a: number) => `${n} tâches · ${a} agents IA vérifiés`,
    foot: "Comment ça marche : chaque tâche demande quelques fonctionnalités (par exemple « lire les e-mails » et « rédiger des réponses »). Un agent apparaît quand son site officiel indique qu'il les possède. Couverture complète d'abord, puis Score Agent.",
    method: "Méthodologie",
  },
};

function price(from: number | null, free: boolean, lang: Lang) {
  if (free) return lang === "fr" ? "gratuit" : "free";
  if (from == null) return null;
  const n = Number(from) % 1 === 0 ? Number(from).toFixed(0) : Number(from).toFixed(2);
  return lang === "fr" ? `${n.replace(".", ",")} $/mois` : `$${n}/mo`;
}

export async function TasksIndexView({ lang = "en" }: { lang?: Lang }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const fr = lang === "fr";
  const L = fr ? COPY.fr : COPY.en;
  const [tasksAll, sumRes, agentsRes] = await Promise.all([
    getTasks(),
    c.from("v_task_summary").select("task_slug,agents_full,agents_any,top_agents,from_usd_month,has_free"),
    c.from("v_agent_cards").select("id", { count: "exact", head: true }),
  ]);
  const sum = new Map(((sumRes.error ? [] : sumRes.data) as Summary[] | null ?? []).map((s) => [s.task_slug, s]));
  const tasks = fr ? tasksAll.filter((t) => TASKS_FR[t.slug]) : tasksAll;

  const themeSlugs = THEME_ORDER.filter((s) => tasks.some((t) => t.category_slug === s))
    .concat([...new Set(tasks.map((t) => t.category_slug ?? "other"))].filter((s) => !THEME_ORDER.includes(s)));
  const themes: ThemeGroup[] = themeSlugs.map((s) => {
    const st = themeStyle(s);
    const any = tasks.find((t) => (t.category_slug ?? "other") === s);
    return { slug: s, name: themeName(lang, s, any?.category ?? s), promise: fr ? st.fr : st.en, color: st.color, soft: st.soft };
  });

  const items: TaskItem[] = tasks.map((t) => {
    const s = sum.get(t.slug);
    return {
      slug: t.slug, href: lhref(lang, `/tasks/${t.slug}`), theme: t.category_slug ?? "other",
      name: fr ? TASKS_FR[t.slug][1] : t.name,
      agents: s?.agents_full ?? 0,
      top: s?.agents_full ? (s.top_agents ?? []).slice(0, 3) : [],
      price: s?.agents_full ? price(s.from_usd_month, s.has_free, lang) : null,
    };
  }).sort((a, b) => b.agents - a.agents || a.name.localeCompare(b.name, lang));

  return (
    <>
      <section className="tb-hero">
        <div className="eyebrow">{L.eyebrow}</div>
        <h1>{L.h1}</h1>
        <p className="lede">{L.lede}</p>
        <ol className="tb-steps">
          {L.steps.map(([h, p], i) => <li key={h}><span className="n">{i + 1}</span><div><b>{h}</b><span>{p}</span></div></li>)}
        </ol>
        <p className="small muted mono" style={{ marginTop: 14 }}>{L.stat(tasks.length, agentsRes.count ?? 0)}</p>
      </section>
      <TasksBrowser tasks={items} themes={themes} lang={fr ? "fr" : "en"} />
      <p className="note" style={{ marginTop: 36 }}>{L.foot} <Link href="/sources">{L.method}</Link></p>
    </>
  );
}
