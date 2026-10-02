import Link from "next/link";
import type { Metadata } from "next";
import { db, getThemes, type AgentCard } from "@/lib/db";
import { SetupNotice, Empty } from "@/components/ui";
import { Quality, Price, Trust } from "@/components/rank";

export const metadata: Metadata = { title: "AI agents — ranked by quality and price", description: "Commercial AI agents ranked by Agent Score, with entry price from each vendor's pricing page.", alternates: { canonical: "/agents" } };
type SP = Promise<{ theme?: string; sort?: string }>;

export default async function AgentsPage({ searchParams }: { searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const sp = await searchParams;
  const sort = sp.sort === "price" ? "price" : "quality";
  let q = c.from("v_agent_cards").select("*", { count: "exact" });
  if (sp.theme) q = q.contains("theme_slugs", [sp.theme]);
  q = sort === "price"
    ? q.order("has_free", { ascending: false }).order("from_usd_month", { ascending: true, nullsFirst: false }).order("quality_score", { ascending: false, nullsFirst: false })
    : q.order("quality_score", { ascending: false, nullsFirst: false }).order("name");
  const [{ data, count }, themes] = await Promise.all([q.limit(300), getThemes()]);
  const rows = (data as AgentCard[] | null) ?? [];
  const href = (o: { theme?: string; sort?: string }) => {
    const m: Record<string, string> = {};
    const t = "theme" in o ? o.theme : sp.theme; const s = "sort" in o ? o.sort : sort;
    if (t) m.theme = t; if (s && s !== "quality") m.sort = s;
    const qs = new URLSearchParams(m).toString();
    return `/agents${qs ? "?" + qs : ""}`;
  };

  return (
    <>
      <div className="eyebrow">Index · AI agents</div>
      <h1>AI agents, ranked</h1>
      <p className="lede">{count ?? 0} commercial AI agents, ranked by Agent Score, with their entry price read on each vendor&apos;s pricing page. Looking for developer tools? See <Link href="/mcp">Tools</Link>.</p>
      <div className="filters">
        <Link href={href({ theme: undefined })} className={`chip ${!sp.theme ? "on" : ""}`}>All themes</Link>
        {themes.map((t) => <Link key={t.theme_slug} href={href({ theme: t.theme_slug })} className={`chip ${sp.theme === t.theme_slug ? "on" : ""}`}>{t.theme}</Link>)}
      </div>
      <div className="filters" style={{ marginTop: 0 }}>
        <span className="small muted">Sort by</span>
        <Link href={href({ sort: "quality" })} className={`chip ${sort === "quality" ? "on" : ""}`}>Quality</Link>
        <Link href={href({ sort: "price" })} className={`chip ${sort === "price" ? "on" : ""}`}>Lowest price</Link>
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? <div className="card-body"><Empty title="No agent yet">Agents appear here once their vendor page has been read.</Empty></div> : (
          <table>
            <thead><tr><th>#</th><th>Agent</th><th>Company</th><th>Theme</th><th>Quality</th><th>From</th><th>Trust</th></tr></thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a.id}>
                  <td className="rank-num">{i + 1}</td>
                  <td><Link href={`/agents/${a.slug}`} className="strong ink">{a.name}</Link>{a.short_description ? <div className="desc">{a.short_description}</div> : null}</td>
                  <td className="small">{a.company ?? "—"}</td>
                  <td className="small">{(a.themes ?? []).join(" · ")}</td>
                  <td><Quality score={a.quality_score} /></td>
                  <td><Price from={a.from_usd_month} free={a.has_free} hasPricing /></td>
                  <td><Trust level={a.pricing_verified ? "verified" : "declared"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
