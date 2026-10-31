import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Out } from "@/components/out";
import { ShareRow } from "@/components/share";
import { FollowBox } from "@/components/follow-box";
import { getFollowers } from "@/lib/follows";
import { appTheme, loadApp, loadApps, money, per, PLATFORM } from "@/lib/apps";
import { shortDate } from "@/lib/format";

export const revalidate = 3600;
type P = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const r = await loadApp((await params).slug);
  if (!r) return {};
  const a = r.app;
  const price = a.from_usd_month != null ? `from $${Number(a.from_usd_month) % 1 === 0 ? Number(a.from_usd_month).toFixed(0) : Number(a.from_usd_month).toFixed(2)}/mo` : a.has_free ? "free plan" : "prices";
  return {
    title: `${a.name} pricing 2026: ${price} & alternatives`,
    description: `${a.short_description ?? a.name} Publisher${a.company ? `: ${a.company}` : ""}. Plans and prices read on the official page.`.slice(0, 300),
    alternates: { canonical: `/apps/${a.slug}` },
  };
}

export default async function AppPage({ params }: { params: P }) {
  const slug = (await params).slug;
  const r = await loadApp(slug);
  if (!r) notFound();
  const { app: a, prices } = r;
  const t = appTheme(a.theme);
  const others = t ? ((await loadApps(t.slug)) ?? []).filter((x) => x.slug !== a.slug).slice(0, 6) : [];
  const from = `/apps/${a.slug}`;

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/apps">AI apps</Link><span>/</span>
        {t ? <><Link href={`/apps/themes/${t.slug}`}>{t.name}</Link><span>/</span></> : null}<span className="ink">{a.name}</span></nav>
      <div className="eyebrow">AI app{t ? ` · ${t.name}` : ""}</div>
      <h1>{a.name}</h1>
      {a.short_description ? <p className="lede">{a.short_description}</p> : null}
      <div className="chips" style={{ marginBottom: 12 }}>
        {a.website ? <Out type="app" slug={a.slug} to="website" from={from} className="btn primary">Official website →</Out> : null}
        {a.pricing_url ? <Out type="app" slug={a.slug} to="pricing" from={from} className="btn">Pricing page →</Out> : null}
      </div>
      <div id="share"><ShareRow kind="app" slug={a.slug} name={a.name} /></div>

      <section className="grid cols-3" style={{ marginTop: 20 }}>
        <div className="card span-2 table-wrap">
          <div className="card-head"><h2>Plans and prices</h2></div>
          {prices.length === 0 ? <div className="card-body small muted">No price published on the official page yet.</div> : (
            <table>
              <thead><tr><th>Plan</th><th>Price</th><th>Read on</th></tr></thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.plan_name}>
                    <td className="strong">{p.plan_name}{p.is_trial ? <span className="small muted"> · trial</span> : null}{p.unit ? <div className="small muted">{p.unit}</div> : null}</td>
                    <td className="mono">{money(p.amount, p.currency)}{Number(p.amount) > 0 ? <span className="faint small">{per(p.interval)}</span> : null}</td>
                    <td className="small muted">{shortDate(p.observed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Facts</h2></div>
          <div className="card-body">
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", margin: 0, fontSize: 14 }}>
              <dt className="muted">Publisher</dt><dd>{a.company ?? "—"}{a.country ? ` (${a.country})` : ""}</dd>
              <dt className="muted">Available on</dt><dd>{(a.platforms ?? []).map((p) => PLATFORM[p] ?? p).join(" · ") || "—"}</dd>
              <dt className="muted">Free plan</dt><dd>{a.has_free ? "Yes" : "No"}</dd>
              <dt className="muted">Privacy policy</dt><dd>{a.privacy_url ? <a href={a.privacy_url} rel="nofollow noopener" target="_blank">Read it →</a> : "—"}</dd>
              <dt className="muted">Last checked</dt><dd>{a.last_verified_at ? shortDate(a.last_verified_at) : "—"}</dd>
            </dl>
          </div>
        </div>
      </section>

      <FollowBox type="app" slug={a.slug} name={a.name} followers={await getFollowers("app", a.slug)} />

      {others.length ? (
        <section style={{ marginTop: 28 }}>
          <h2>Alternatives to {a.name}</h2>
          <ul className="signals card">
            {others.map((o) => <li className="signal" key={o.slug}><Link href={`/apps/${o.slug}`} className="strong">{o.name}</Link>{o.short_description ? <span className="small muted"> · {o.short_description}</span> : null}</li>)}
          </ul>
          {t ? <p className="small"><Link href={`/apps/themes/${t.slug}`}>All {t.name.toLowerCase()} apps →</Link></p> : null}
        </section>
      ) : null}

      <p className="note">AI apps are listed apart from AI agents: they are not scored or ranked. Facts and prices are read on the publisher&apos;s official pages, with the date. Something wrong? Write to contact@electraindex.com.</p>
    </>
  );
}
