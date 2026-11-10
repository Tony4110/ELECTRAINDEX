import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SetupNotice } from "@/components/ui";
import { Logo } from "@/components/rank";

export const metadata: Metadata = {
  title: "Trending AI agents, MCP servers and AI apps — 24h, 7 days, 30 days",
  description: "Which AI agents and MCP servers are gaining adoption right now: GitHub stars gained and npm downloads over 24 hours, 7 days and 30 days. Official APIs only, refreshed every hour.",
  alternates: { canonical: "/trending" },
};

type SP = Promise<{ p?: string; kind?: string; sort?: string }>;
type Row = {
  period: string; type: "agent" | "mcp_server" | "app"; slug: string; name: string; short_description: string | null; website: string | null;
  stars: number | null; stars_gain: number | null; downloads: number | null; downloads_prev: number | null; downloads_growth: number | null;
  spark: number[] | null; score: number; rank_all: number; computed_at: string;
};

const PERIODS = { "24h": "24H", "7d": "7D", "30d": "30D" } as const;
const KINDS = { all: "All", agents: "AI agents", mcp: "MCP servers", apps: "AI apps" } as const;
const TYPE_OF: Record<string, Row["type"] | null> = { all: null, agents: "agent", mcp: "mcp_server", apps: "app" };
const SORTS = { trending: "Trending", stars: "Stars gained", downloads: "Downloads" } as const;
const SORT_COL: Record<keyof typeof SORTS, string> = { trending: "score", stars: "stars_gain", downloads: "downloads" };
const LABEL: Record<Row["type"], string> = { agent: "AGENT", mcp_server: "MCP", app: "APP" };
const href = (r: Row) => (r.type === "agent" ? `/agents/${r.slug}` : r.type === "app" ? `/apps/${r.slug}` : `/mcp/${r.slug}`);

const fmt = (n: number | null | undefined) => {
  if (n == null) return null;
  const v = Number(n);
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(0)}k`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
};

function Spark({ values }: { values: number[] | null }) {
  const v = (values ?? []).map(Number);
  if (v.length < 2) return <span className="faint">—</span>;
  const max = Math.max(...v), min = Math.min(...v), w = 96, h = 28, span = max - min || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 2 - ((x - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  const up = v[v.length - 1] >= v[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`tr-spark ${up ? "up" : "down"}`} aria-hidden="true">
      <polyline points={pts} fill="none" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Change({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="faint">—</span>;
  const v = Number(pct);
  return <span className={`tr-pct ${v >= 0 ? "pos" : "neg"}`}>{v >= 0 ? "▲" : "▼"} {Math.abs(v) >= 1000 ? fmt(Math.abs(v)) : Math.abs(v).toFixed(v >= 100 || v <= -100 ? 0 : 1)}%</span>;
}

export default async function TrendingPage({ searchParams }: { searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const sp = await searchParams;
  const p = (sp.p && sp.p in PERIODS ? sp.p : "24h") as keyof typeof PERIODS;
  const kind = (sp.kind && sp.kind in KINDS ? sp.kind : "all") as keyof typeof KINDS;
  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : "trending") as keyof typeof SORTS;

  let q = c.from("v_trending").select("*").eq("period", p)
    .order(SORT_COL[sort], { ascending: false, nullsFirst: false }).order("score", { ascending: false }).limit(100);
  if (TYPE_OF[kind]) q = q.eq("type", TYPE_OF[kind]!);
  const r = await q;
  const installed = !r.error;
  const rows = ((r.data as Row[] | null) ?? []).filter((x) => sort !== "stars" || Number(x.stars_gain) > 0).filter((x) => sort !== "downloads" || Number(x.downloads) > 0);
  const updated = rows[0]?.computed_at ? new Date(rows[0].computed_at) : null;

  const qs = (o: { p?: string; kind?: string; sort?: string }) => {
    const v = { p, kind, sort, ...o };
    const m = new URLSearchParams({
      ...(v.p !== "24h" ? { p: v.p } : {}), ...(v.kind !== "all" ? { kind: v.kind } : {}), ...(v.sort !== "trending" ? { sort: v.sort } : {}),
    }).toString();
    return `/trending${m ? "?" + m : ""}`;
  };
  const periodWord = p === "24h" ? "24 hours" : p === "7d" ? "7 days" : "30 days";

  return (
    <>
      <section className="tr-hero">
        <div className="eyebrow">Trending · refreshed every hour</div>
        <h1>What the agent economy is adopting right now</h1>
        <p className="lede">GitHub stars gained and npm downloads over the last {periodWord}, read from the official GitHub and npm APIs. No votes, no paid placement. A gain only appears once we hold an older reading to compare with.</p>
      </section>

      <div className="tr-bar">
        <div className="tr-periods" role="tablist" aria-label="Period">
          {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((k) => (
            <Link key={k} role="tab" aria-selected={p === k} href={qs({ p: k })} className={p === k ? "on" : ""}>{PERIODS[k]}</Link>
          ))}
        </div>
        <div className="tr-kinds">
          {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => <Link key={k} href={qs({ kind: k })} className={kind === k ? "on" : ""}>{KINDS[k]}</Link>)}
        </div>
        <span className="spacer" />
        <div className="tr-sorts" aria-label="Sort by">
          {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => <Link key={k} href={qs({ sort: k })} className={sort === k ? "on" : ""}>{SORTS[k]}</Link>)}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card tr-empty">
          <div className="strong ink">{installed ? "The first readings are being collected." : "Trending is being set up."}</div>
          <p className="muted">Downloads appear within the hour. Stars gained appear once we hold a reading at least {periodWord} old. We never fill the gap with estimates.</p>
          <Link href="/new" className="btn">See the latest launches →</Link>
        </div>
      ) : (
        <div className="card table-wrap tr-table">
          <table>
            <thead>
              <tr>
                <th className="num">#</th><th>Product</th>
                <th className="num">Stars</th><th className="num">Stars gained</th>
                <th className="num">Downloads ({PERIODS[p]})</th><th className="num">vs previous</th>
                <th className="tr-sp-h">Downloads, daily</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={x.slug + x.type}>
                  <td className="num mono faint">{i + 1}</td>
                  <td>
                    <Link href={href(x)} className="tr-prod">
                      <Logo name={x.name} website={x.website} size={30} />
                      <span><span className="strong ink">{x.name}</span> <span className={`tr-type t-${x.type}`}>{LABEL[x.type]}</span>
                        {x.short_description ? <span className="desc tr-desc">{x.short_description}</span> : null}</span>
                    </Link>
                  </td>
                  <td className="num mono">{fmt(x.stars) ?? <span className="faint">—</span>}</td>
                  <td className="num mono">{x.stars_gain == null ? <span className="faint" title="No reading old enough yet">—</span> : <span className={Number(x.stars_gain) > 0 ? "tr-pct pos" : "muted"}>{Number(x.stars_gain) > 0 ? "+" : ""}{fmt(x.stars_gain)}</span>}</td>
                  <td className="num mono">{fmt(x.downloads) ?? <span className="faint">—</span>}</td>
                  <td className="num mono"><Change pct={x.downloads_growth} /></td>
                  <td className="tr-sp"><Spark values={x.spark} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="small muted" style={{ marginTop: 14 }}>
        {updated ? <>Last computed {updated.toUTCString().replace(" GMT", " UTC")}. </> : null}
        Sources: <Link href="/sources">GitHub API (SRC-018) and npm downloads API (SRC-019)</Link>. Trending measures adoption, not quality: see each product page for its verified score.
      </p>
    </>
  );
}
