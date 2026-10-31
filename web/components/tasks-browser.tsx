"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

export type TaskItem = { slug: string; href: string; name: string; theme: string; agents: number; top: string[]; price: string | null };
export type ThemeGroup = { slug: string; name: string; promise: string; color: string; soft: string };

const T = {
  en: { ph: "Search a task: invoices, emails, code review…", all: "All", none: "No task matches. Try another word.", agents: (n: number) => (n === 0 ? "No agent yet" : n === 1 ? "1 agent can do it" : `${n} agents can do it`), top: "Top:", from: "from" },
  fr: { ph: "Cherchez une tâche : factures, e-mails, relecture de code…", all: "Tout", none: "Aucune tâche ne correspond. Essayez un autre mot.", agents: (n: number) => (n === 0 ? "Aucun agent pour l'instant" : n === 1 ? "1 agent sait le faire" : `${n} agents savent le faire`), top: "En tête :", from: "dès" },
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function TasksBrowser({ tasks, themes, lang }: { tasks: TaskItem[]; themes: ThemeGroup[]; lang: "en" | "fr" }) {
  const t = T[lang];
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState<string | null>(null);
  const shown = useMemo(() => {
    const n = norm(q.trim());
    return tasks.filter((x) => (!theme || x.theme === theme) && (!n || norm(x.name).includes(n)));
  }, [tasks, q, theme]);

  return (
    <>
      <div className="tb-controls">
        <input className="tb-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.ph} aria-label={t.ph} />
        <div className="tb-chips" role="group">
          <button type="button" className={`tb-chip ${!theme ? "on" : ""}`} onClick={() => setTheme(null)}>{t.all}</button>
          {themes.map((g) => (
            <button key={g.slug} type="button" className={`tb-chip ${theme === g.slug ? "on" : ""}`} style={{ ["--c" as string]: g.color, ["--s" as string]: g.soft }} onClick={() => setTheme(theme === g.slug ? null : g.slug)}>
              <span className="dot" />{g.name}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? <p className="tb-none">{t.none}</p> : null}
      {themes.map((g) => {
        const list = shown.filter((x) => x.theme === g.slug);
        if (!list.length) return null;
        return (
          <section key={g.slug} className="tb-group" style={{ ["--c" as string]: g.color, ["--s" as string]: g.soft }}>
            <header className="tb-head">
              <span className="tb-bar" />
              <div><h2>{g.name}</h2><p>{g.promise}</p></div>
              <span className="tb-count">{list.length}</span>
            </header>
            <div className="tb-grid">
              {list.map((x) => (
                <Link key={x.slug} href={x.href} className="tb-card">
                  <span className="tb-name">{x.name}</span>
                  <span className={`tb-agents ${x.agents ? "" : "zero"}`}>{t.agents(x.agents)}{x.price ? <span className="tb-price"> · {t.from} {x.price}</span> : null}</span>
                  {x.top.length ? <span className="tb-top">{t.top} {x.top.join(", ")}</span> : null}
                  <span className="tb-go" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
