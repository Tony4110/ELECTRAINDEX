import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SetupNotice, Empty } from "@/components/ui";
import { featuredPairsByTheme, pairSlug } from "@/lib/compare";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Compare AI agents side by side",
  description: "Head-to-head comparisons of AI agents on Agent Score, pricing, capabilities and trust — every fact sourced and dated.",
  alternates: { canonical: "/compare" },
};

const PER_THEME = 10;

export default async function CompareHub() {
  const c = db();
  if (!c) return <SetupNotice />;
  const groups = await featuredPairsByTheme(6);

  return (
    <>
      <div className="eyebrow">Compare</div>
      <h1>Compare AI agents side by side</h1>
      <p className="lede">
        Head-to-head on what matters: Agent Score, entry price, capabilities and trust level — with a clear
        &ldquo;choose this if&rdquo; verdict drawn from the data. Pick two agents from the same category below, or start from any
        agent&apos;s page and hit <em>Compare with</em>.
      </p>

      {groups.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-body"><Empty title="Comparisons are being built">They appear as soon as a category has at least two scored agents.</Empty></div>
        </div>
      ) : (
        <section className="grid cols-2" style={{ marginTop: 20 }}>
          {groups.map((g) => (
            <div className="card" key={g.themeSlug}>
              <div className="card-head">
                <h2><Link href={`/themes/${g.themeSlug}`} className="ink">{g.theme}</Link></h2>
              </div>
              <ul className="signals">
                {g.pairs.slice(0, PER_THEME).map((p) => (
                  <li className="signal" key={`${p.a}-${p.b}`}>
                    <Link href={`/compare/${pairSlug(p.a, p.b)}`} className="strong ink">{p.aName} <span className="faint">vs</span> {p.bName}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
