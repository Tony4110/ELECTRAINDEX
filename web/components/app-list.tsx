import Link from "next/link";
import { Logo, Price } from "@/components/rank";
import { appTheme, APP_THEMES, PLATFORM, type AppCard } from "@/lib/apps";

const cssVars = (slug: string | null | undefined) => { const t = appTheme(slug); return { ["--c" as string]: t?.color ?? "#56615C", ["--s" as string]: t?.soft ?? "#ECEFEA" }; };

/** One card per app: logo, publisher, what it does, where it runs, entry price. */
export function AppCards({ rows }: { rows: AppCard[] }) {
  return (
    <div className="ap-grid">
      {rows.map((a) => (
        <Link key={a.id} href={`/apps/${a.slug}`} className="ap-card" style={cssVars(a.theme)}>
          <span className="ap-head">
            <Logo name={a.name} website={a.website} size={44} />
            <span><span className="ap-name">{a.name}</span><span className="ap-pub">{a.company ?? ""}{a.country ? ` · ${a.country}` : ""}</span></span>
          </span>
          {a.short_description ? <span className="ap-desc">{a.short_description}</span> : null}
          <span className="ap-foot">
            <span className="ap-plat">{(a.platforms ?? []).map((p) => PLATFORM[p] ?? p).join(" · ")}</span>
            <span className="ap-price"><Price from={a.from_usd_month} free={a.has_free} /></span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Theme pills (link to each theme page), current one filled with its colour. */
export function AppThemePills({ current, counts }: { current?: string; counts?: Record<string, number> }) {
  return (
    <nav className="theme-line ap-pills" aria-label="App themes">
      <Link href="/apps" className={!current ? "on" : ""}>All{counts ? <span className="n">{Object.values(counts).reduce((x, y) => x + y, 0)}</span> : null}</Link>
      {APP_THEMES.map((t) => (
        <Link key={t.slug} href={`/apps/themes/${t.slug}`} className={current === t.slug ? "on" : ""} style={cssVars(t.slug)}>
          {t.name}{counts ? <span className="n">{counts[t.slug] ?? 0}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export { cssVars as appVars };
