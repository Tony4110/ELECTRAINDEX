import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SetupNotice, Empty } from "@/components/ui";
import { Out } from "@/components/out";
import { Logo } from "@/components/rank";
import { ShareRow } from "@/components/share";
import { FollowBox } from "@/components/follow-box";
import { AppCards, AppThemePills, appVars, themeText } from "@/components/app-list";
import { APP_THEMES, loadApp, loadApps, PLATFORM } from "@/lib/apps";
import { appsT, loadAppTexts } from "@/lib/apps-i18n";
import { getFollowers } from "@/lib/follows";
import { shortDate } from "@/lib/format";
import { alternatesFor, lhref, OG_LOCALE, type Lang } from "@/lib/i18n";

const meta = (path: string, lang: Lang, title: string, description: string): Metadata =>
  ({ title, description, alternates: alternatesFor(path, lang), ...(lang !== "en" ? { openGraph: { locale: OG_LOCALE[lang] } } : {}) });

export function appsIndexMeta(lang: Lang): Metadata {
  return lang === "fr"
    ? meta("/apps", lang, "Apps IA 2026 : coaching, langues, créativité, design, avec les prix", "Les apps IA du quotidien : coaching, journal, langues, photo, musique, accessibilité et design. Éditeur, plateformes et prix vérifiés sur les pages officielles.")
    : meta("/apps", lang, "AI apps 2026: coaching, learning, creativity & more, with prices", "Consumer AI apps for coaching, journaling, languages, photos, music, accessibility and design. Publisher, platforms and prices read on each official page.");
}

export async function AppsIndexView({ lang = "en" }: { lang?: Lang }) {
  const T = appsT(lang);
  const [rows, texts] = await Promise.all([loadApps(), loadAppTexts(lang)]);
  if (rows === null) return <SetupNotice />;
  const counts = Object.fromEntries(APP_THEMES.map((t) => [t.slug, rows.filter((r) => r.theme === t.slug).length]));
  return (
    <>
      <section className="tb-hero ln-hero">
        <div className="eyebrow">{T.eyebrow}</div>
        <h1>{T.h1}</h1>
        <div className="ln-hero-row"><p className="lede">{T.lede}</p><Link href={lhref(lang, "/submit")} className="btn primary">{T.submit}</Link></div>
      </section>
      <AppThemePills counts={counts} lang={lang} />
      {rows.length === 0
        ? <div className="card" style={{ marginTop: 16 }}><div className="card-body"><Empty title={T.empty}>{T.emptyBody}</Empty></div></div>
        : APP_THEMES.map((t0) => {
            const t = themeText(t0.slug, lang)!;
            const list = rows.filter((r) => r.theme === t.slug);
            if (!list.length) return null;
            return (
              <section key={t.slug} className="tb-group" style={appVars(t.slug)}>
                <header className="tb-head">
                  <span className="tb-bar" />
                  <div><h2><Link href={lhref(lang, `/apps/themes/${t.slug}`)} className="ink">{t.name}</Link></h2><p>{t.intro}</p></div>
                  <span className="tb-count">{list.length}</span>
                </header>
                <AppCards rows={list} lang={lang} texts={texts} />
              </section>
            );
          })}
      <p className="note" style={{ marginTop: 32 }}>{T.note}</p>
    </>
  );
}

export function appThemeMeta(slug: string, lang: Lang): Metadata {
  const t = themeText(slug, lang);
  if (!t) return {};
  return lang === "fr"
    ? meta(`/apps/themes/${slug}`, lang, `${t.title} 2026 : comparatif avec les prix`, `${t.intro} Éditeur, plateformes et prix vérifiés sur les pages officielles.`)
    : meta(`/apps/themes/${slug}`, lang, `${t.title} 2026: compared with prices`, `${t.intro} Publisher, platforms and prices read on each official page.`);
}

export async function AppThemeView({ slug, lang = "en" }: { slug: string; lang?: Lang }) {
  const T = appsT(lang);
  const t = themeText(slug, lang);
  if (!t) notFound();
  const [all, texts] = await Promise.all([loadApps(), loadAppTexts(lang)]);
  if (all === null) return <SetupNotice />;
  const rows = all.filter((r) => r.theme === slug);
  const counts = Object.fromEntries(APP_THEMES.map((x) => [x.slug, all.filter((r) => r.theme === x.slug).length]));
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={lhref(lang, "/apps")}>{T.eyebrow}</Link><span>/</span><span className="ink">{t.name}</span></nav>
      <section className="tb-hero ln-hero tk-hero" style={appVars(slug)}>
        <div className="eyebrow">{T.eyebrow} · {t.name}</div>
        <h1>{t.title}</h1>
        <div className="ln-hero-row"><p className="lede">{t.intro} {rows.length ? T.nApps(rows.length) : ""}</p><Link href={lhref(lang, "/submit")} className="btn primary">{T.submit}</Link></div>
      </section>
      <AppThemePills current={slug} counts={counts} lang={lang} />
      {rows.length === 0 ? <div className="card" style={{ marginTop: 16 }}><div className="card-body"><Empty title={T.empty}>{T.emptyBody}</Empty></div></div>
        : <div style={{ marginTop: 18 }}><AppCards rows={rows} lang={lang} texts={texts} /></div>}
      <p className="note" style={{ marginTop: 28 }}>{T.themeNote}</p>
    </>
  );
}

function money(amount: number | null, currency: string | null, lang: Lang) {
  if (amount == null) return "—";
  if (Number(amount) === 0) return appsT(lang).free;
  const n = Number(amount) % 1 === 0 ? Number(amount).toFixed(0) : Number(amount).toFixed(2);
  const sym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : !currency || currency === "USD" ? "$" : ` ${currency}`;
  return lang === "fr" ? `${n.replace(".", ",")} ${sym.trim()}` : sym.length === 1 ? `${sym}${n}` : `${n}${sym}`;
}

export async function appPageMeta(slug: string, lang: Lang): Promise<Metadata> {
  const [r, texts] = await Promise.all([loadApp(slug), loadAppTexts(lang)]);
  if (!r) return {};
  const a = r.app;
  const n = a.from_usd_month != null ? (Number(a.from_usd_month) % 1 === 0 ? Number(a.from_usd_month).toFixed(0) : Number(a.from_usd_month).toFixed(2)) : null;
  const desc = texts.get(a.slug) ?? a.short_description ?? a.name;
  return lang === "fr"
    ? meta(`/apps/${a.slug}`, lang, `Prix de ${a.name} en 2026 : ${n ? `dès ${n.replace(".", ",")} $/mois` : a.has_free ? "plan gratuit" : "formules"} et alternatives`, `${desc} Éditeur${a.company ? ` : ${a.company}` : ""}. Formules et prix lus sur la page officielle.`.slice(0, 300))
    : meta(`/apps/${a.slug}`, lang, `${a.name} pricing 2026: ${n ? `from $${n}/mo` : a.has_free ? "free plan" : "prices"} & alternatives`, `${desc} Publisher${a.company ? `: ${a.company}` : ""}. Plans and prices read on the official page.`.slice(0, 300));
}

export async function AppPageView({ slug, lang = "en" }: { slug: string; lang?: Lang }) {
  const T = appsT(lang);
  const [r, texts] = await Promise.all([loadApp(slug), loadAppTexts(lang)]);
  if (!r) notFound();
  const { app: a, prices } = r;
  const t = a.theme ? themeText(a.theme, lang) : null;
  const [others, followers] = await Promise.all([
    t ? loadApps(t.slug).then((x) => (x ?? []).filter((y) => y.slug !== a.slug).slice(0, 6)) : Promise.resolve([]),
    getFollowers("app", a.slug),
  ]);
  const from = `/apps/${a.slug}`;
  const desc = texts.get(a.slug) ?? a.short_description;
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={lhref(lang, "/apps")}>{T.eyebrow}</Link><span>/</span>
        {t ? <><Link href={lhref(lang, `/apps/themes/${t.slug}`)}>{t.name}</Link><span>/</span></> : null}<span className="ink">{a.name}</span></nav>
      <section className="tk-hero" style={appVars(a.theme)}>
        <div className="eyebrow">{T.app}{t ? ` · ${t.name}` : ""}</div>
        <div className="ap-head" style={{ marginTop: 6 }}><Logo name={a.name} website={a.website} size={52} /><h1 style={{ margin: 0 }}>{a.name}</h1></div>
        {desc ? <p className="lede tk-lede" style={{ marginTop: 10 }}>{desc}</p> : null}
        <div className="chips" id="share" style={{ marginTop: 12 }}>
          {a.website ? <Out type="app" slug={a.slug} to="website" from={from} className="btn primary">{T.site}</Out> : null}
          {a.pricing_url ? <Out type="app" slug={a.slug} to="pricing" from={from} className="btn">{T.pricingPage}</Out> : null}
          <ShareRow kind="app" slug={a.slug} name={a.name} />
        </div>
      </section>

      <section className="grid cols-3" style={{ marginTop: 20 }}>
        <div className="card span-2 table-wrap">
          <div className="card-head"><h2>{T.plans}</h2></div>
          {prices.length === 0 ? <div className="card-body small muted">{a.has_free ? T.freePlan : T.noPrice}</div> : (
            <table>
              <thead><tr>{T.th.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.plan_name}>
                    <td className="strong">{p.plan_name}{p.is_trial ? <span className="small muted"> · {T.trial}</span> : null}{p.unit ? <div className="small muted">{p.unit}</div> : null}</td>
                    <td className="mono">{money(p.amount, p.currency, lang)}{Number(p.amount) > 0 ? <span className="faint small">{T.per[p.interval ?? ""] ?? ""}</span> : null}</td>
                    <td className="small muted">{shortDate(p.observed_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>{T.facts}</h2></div>
          <div className="card-body">
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", margin: 0, fontSize: 14 }}>
              <dt className="muted">{T.publisher}</dt><dd>{a.company ?? "—"}{a.country ? ` (${a.country})` : ""}</dd>
              <dt className="muted">{T.on}</dt><dd>{(a.platforms ?? []).map((p) => PLATFORM[p] ?? p).join(" · ") || "—"}</dd>
              <dt className="muted">{T.freePlan}</dt><dd>{a.has_free ? T.yes : T.no}</dd>
              <dt className="muted">{T.privacy}</dt><dd>{a.privacy_url ? <a href={a.privacy_url} rel="nofollow noopener" target="_blank">{T.read}</a> : "—"}</dd>
              <dt className="muted">{T.checked}</dt><dd>{a.last_verified_at ? shortDate(a.last_verified_at, lang) : "—"}</dd>
            </dl>
          </div>
        </div>
      </section>

      <FollowBox type="app" slug={a.slug} name={a.name} followers={followers} lang={lang} />

      {others.length ? (
        <section style={{ marginTop: 28 }}>
          <h2>{T.alts(a.name)}</h2>
          <AppCards rows={others} lang={lang} texts={texts} />
          {t ? <p className="small" style={{ marginTop: 10 }}><Link href={lhref(lang, `/apps/themes/${t.slug}`)}>{T.allIn(t.name)}</Link></p> : null}
        </section>
      ) : null}
      <p className="note">{T.pageNote}</p>
    </>
  );
}
