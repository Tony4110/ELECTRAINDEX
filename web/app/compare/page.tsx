import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SetupNotice, Empty } from "@/components/ui";
import { Logo } from "@/components/rank";
import { featuredPairsByTheme, pairSlug } from "@/lib/compare";
import { themeStyle, THEME_ORDER } from "@/lib/theme-style";
import { ComparePicker } from "@/components/compare-picker";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Compare AI agents side by side: score, price, features",
  description: "Pick any two AI agents and compare them head-to-head on Agent Score, entry price, capabilities and trust, with a clear 'choose this if' verdict. Every fact sourced and dated.",
  alternates: { canonical: "/compare" },
};

const PER_THEME = 6;

export default async function CompareHub() {
  const c = db();
  if (!c) return <SetupNotice />;
  const [groupsRaw, { data: ag }] = await Promise.all([
    featuredPairsByTheme(5),
    c.from("v_agent_cards").select("slug,name,website").order("name"),
  ]);
  const agents = (ag as { slug: string; name: string; website: string | null }[] | null) ?? [];
  const site = new Map(agents.map((x) => [x.slug, x.website]));
  const groups = [...groupsRaw].sort((x, y) => (THEME_ORDER.indexOf(x.themeSlug) + 99) % 99 - (THEME_ORDER.indexOf(y.themeSlug) + 99) % 99);

  return (
    <>
      <section className="tb-hero ln-hero">
        <div className="eyebrow">Compare</div>
        <h1>Compare any two AI agents</h1>
        <p className="lede">Head-to-head on what matters: Agent Score, entry price, capabilities and trust, with a clear &ldquo;choose this if&rdquo; verdict drawn from the data.</p>
        <ComparePicker agents={agents.map(({ slug, name }) => ({ slug, name }))} />
      </section>

      {groups.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-body"><Empty title="Comparisons are being built">They appear as soon as a category has at least two scored agents.</Empty></div>
        </div>
      ) : (
        <>
          <h2 className="ln-day" style={{ marginTop: 28 }}>Popular match-ups by theme</h2>
          <div className="cp-themes">
            {groups.map((g) => {
              const st = themeStyle(g.themeSlug);
              return (
                <section key={g.themeSlug} className="cp-theme" style={{ ["--c" as string]: st.color, ["--s" as string]: st.soft }}>
                  <header className="cp-theme-head">
                    <span className="tb-bar" />
                    <div><h3><Link href={`/themes/${g.themeSlug}`} className="ink">{g.theme}</Link></h3><p>{st.en}</p></div>
                  </header>
                  <ul className="cp-pairs">
                    {g.pairs.slice(0, PER_THEME).map((p) => (
                      <li key={`${p.a}-${p.b}`}>
                        <Link href={`/compare/${pairSlug(p.a, p.b)}`} className="cp-pair">
                          <span className="cp-side"><Logo name={p.aName} website={site.get(p.a)} size={26} /><span>{p.aName}</span></span>
                          <span className="cp-mid">vs</span>
                          <span className="cp-side r"><span>{p.bName}</span><Logo name={p.bName} website={site.get(p.b)} size={26} /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
      <p className="note" style={{ marginTop: 28 }}>Comparisons use the same public, dated facts as the rankings. No paid placement: a sponsor never changes a verdict.</p>
    </>
  );
}
