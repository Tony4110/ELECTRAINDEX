import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { db, fromCaps } from "@/lib/db";
import { searchTools, type ToolHit } from "@/lib/tool-search";
import { num } from "@/lib/format";
import { loadEcosystem } from "@/components/reliability";

type SP = Promise<{ q?: string; cap?: string; access?: string; src?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const base: Metadata = {
    title: "MCP Tools — find what your AI agent can connect to",
    description: "Search 335,000 tools exposed by live MCP servers by what they do. See in one line whether each one works without a key, how available it was over 30 days and whether its publisher is verified. Tested daily by Electra Index.",
    alternates: { canonical: "/mcp" },
  };
  return sp.q || sp.cap || sp.access || sp.src ? { ...base, robots: { index: false, follow: true } } : base;
}

const CAP_LOOK = [
  { bg: "var(--accent-soft)", fg: "var(--accent)" }, { bg: "var(--pos-soft)", fg: "var(--pos)" },
  { bg: "var(--sun-soft)", fg: "var(--sun-ink)" }, { bg: "var(--ember-soft)", fg: "var(--ember-ink)" },
];
const CAP_ICON: Record<string, string> = {
  "social-media-management": "◎", payments: "$", "document-understanding": "▤", "sql-querying": "⌗", invoicing: "€",
  "travel-booking": "✈", "seo-optimization": "↗", "web-scraping": "⌘", "browser-automation": "⧉", "devops-automation": "⚙",
  "knowledge-base-qa": "?", "lead-generation": "◆", "e-commerce-management": "◫", "api-integration": "⇄", "calendar-management": "◷",
  "web-research": "⌕", "security-scanning": "◈", procurement: "▦",
};

function when(iso: string | null) {
  if (!iso) return "not checked yet";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? "checked < 1 h ago" : h < 48 ? `checked ${h} h ago` : `checked ${Math.round(h / 24)} days ago`;
}
function Status({ s }: { s: string | null }) {
  if (s === "online") return <span className="badge pos">works without a key</span>;
  if (s === "auth_required") return <span className="badge warn">key or sign-in required</span>;
  return <span className="badge neg">not answering at last check</span>;
}
async function visitor() {
  const h = await headers();
  return (h.get("x-nf-client-connection-ip") || h.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
}

type Live = { mcp: { servers: number; tested: number; online_tools: number; tools: number } };
type Cap = { capability_slug: string; capability: string; tools: number };

export default async function McpTools({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const cap = (sp.cap ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const access = sp.access === "open" || sp.access === "key" ? sp.access : "";
  const src = sp.src === "official" || sp.src === "community" ? sp.src : "";
  const c = db();

  const [res, liveRow, capRows, eco] = await Promise.all([
    q ? searchTools({ q, client: await visitor(), capability: cap, access, official: src === "official" ? true : src === "community" ? false : null }) : Promise.resolve(null),
    c ? c.from("v_research_live").select("data").maybeSingle().then((r) => (r.data as { data: Live } | null)?.data ?? null) : Promise.resolve(null),
    c ? fromCaps((t) => c.from(t).select("capability_slug,capability,tools").gt("tools", 0).order("tools", { ascending: false }).limit(18)).then((r) => (r.data as Cap[] | null) ?? []) : Promise.resolve([] as Cap[]),
    c ? loadEcosystem(c) : Promise.resolve(null),
  ]);
  const capName = new Map(capRows.map((x) => [x.capability_slug, x.capability]));
  const m = liveRow?.mcp;
  const href = (p: Record<string, string>) => {
    const u = new URLSearchParams(); const all = { q, cap, access, src, ...p };
    Object.entries(all).forEach(([k, v]) => { if (v) u.set(k, v); });
    return `/mcp?${u.toString()}`;
  };

  return (
    <div className="ft">
      <section className={`ft-band ${q ? "compact" : ""}`}>
        {m ? (
          <div className="ft-live">
            <span className="dot" /><b>Live</b><span className="sep" />
            <span><b>{num(m.online_tools)}</b> servers answering</span><span className="sep" />
            <span><b>{num(m.tools)}</b> tools</span>
            {eco ? <><span className="sep" /><Link href="/mcp-reliability-index" className="ft-idx">MCP Reliability Index <b>{eco.value.toFixed(1)}%</b> · 7 days →</Link></> : null}
          </div>
        ) : null}
        <h1 className="ft-title">Search the tools of every MCP server we test live</h1>
        <form className="ft-search" action="/mcp" method="get" role="search">
          <label htmlFor="ftq" className="sr-only">What should your agent be able to do?</label>
          <input id="ftq" name="q" type="search" defaultValue={q} placeholder="e.g. create an invoice, send an email, query postgres" />
          <button className="btn primary" type="submit">Find tools</button>
        </form>
        {q ? (
          <div className="ft-chips">
            <Link className={`chip ${!access ? "on" : ""}`} href={href({ access: "" })}>Any access</Link>
            <Link className={`chip ${access === "open" ? "on" : ""}`} href={href({ access: "open" })}>Works without a key</Link>
            <Link className={`chip ${access === "key" ? "on" : ""}`} href={href({ access: "key" })}>Key required</Link>
            <span className="ft-sep" />
            <Link className={`chip ${!src ? "on" : ""}`} href={href({ src: "" })}>All publishers</Link>
            <Link className={`chip ${src === "official" ? "on" : ""}`} href={href({ src: "official" })}>Official only</Link>
            {cap ? <Link className="chip on" href={href({ cap: "" })}>#{capName.get(cap) ?? cap} ✕</Link> : null}
          </div>
        ) : null}
      </section>

      {!q ? (
        <>
          {capRows.length ? (
            <>
              <h2 className="ft-h2">Browse by use case</h2>
              <p className="ft-h2s">The most common things agents connect to. Each page ranks servers by measured availability.</p>
              <div className="ft-caps2">
                {capRows.slice(0, 8).map((x, i) => {
                  const k = CAP_LOOK[i % CAP_LOOK.length];
                  return (
                    <Link key={x.capability_slug} href={`/mcp/best/${x.capability_slug}`} className="ft-cap2">
                      <span className="ic" style={{ background: k.bg, color: k.fg }}>{CAP_ICON[x.capability_slug] ?? x.capability.charAt(0)}</span>
                      <span><b>{x.capability}</b><span>{num(x.tools)} servers</span></span>
                    </Link>
                  );
                })}
              </div>
              <div className="ft-more"><span className="muted small">More use cases, each ranked by measured availability</span><Link href="/mcp/best">See all use cases →</Link></div>
            </>
          ) : null}

          <div className="ft-legend">
            <div><i className="pos">No key</i><p>The server answered and listed its tools without credentials.</p></div>
            <div><i className="acc">Official</i><p>The publisher proved its domain to the Official MCP Registry (e.g. com.stripe/…).</p></div>
            <div><i className="sun">99.6%</i><p>Observed availability over 30 days: share of our conclusive tests that got an answer. Shown from 10 tests.</p></div>
          </div>
          <div className="ft-foot">
            <Link href="/mcp/directory">Browse all {m ? num(m.servers) : ""} servers</Link>
            <Link href="/mcp/best">Best servers by use case</Link>
            <Link href="/mcp-reliability-index">Reliability Index</Link>
            <Link href="/mcp-server">Use this search from your agent (MCP)</Link>
          </div>
        </>
      ) : res?.error === "quota" ? (
        <p className="card" style={{ padding: 16, marginTop: 16 }}>You have reached today&apos;s free search limit. It resets tomorrow. Building an agent? Use the <Link href="/mcp-server">Electra Index MCP server</Link>.</p>
      ) : res?.error ? (
        <p className="muted" style={{ marginTop: 16 }}>Search is temporarily unavailable. Please try again in a minute.</p>
      ) : (
        <>
          <p className="small muted" style={{ margin: "14px 0 10px" }}>
            {res && res.results.length ? <>{res.results.length} tools for “{q}”{cap ? <> in {capName.get(cap) ?? cap}</> : null} · best match first · at most 3 per server</> : <>No tool found for “{q}”. Try fewer or simpler words, e.g. “invoice”.</>}
          </p>
          <ol className="ft-list">
            {res?.results.map((t: ToolHit) => (
              <li key={`${t.slug}:${t.tool}`} className="card ft-hit">
                <div className="ft-top">
                  <code className="ft-tool">{t.tool}</code>
                  <Status s={t.status} />
                  <span className={`badge ${t.official ? "accent" : ""}`}>{t.official ? "official" : "community"}</span>
                </div>
                {t.description ? <p className="ft-desc">{t.description}</p> : null}
                <div className="ft-meta small muted">
                  <span>on <Link href={`/mcp/${t.slug}`} className="strong">{t.server}</Link>{t.tool_count ? <> · {t.tool_count} tools</> : null}</span>
                  <span>{t.uptime_30d != null && t.checks_30d >= 10 ? <Link href={`/mcp/${t.slug}#reliability`}>{t.uptime_30d}% observed availability, 30 days ({t.checks_30d} checks)</Link> : <>availability: fewer than 10 checks so far</>}</span>
                  <span>{when(t.checked_at)}</span>
                  {t.capabilities.slice(0, 3).map((x) => <Link key={x} href={href({ cap: x })}>#{capName.get(x) ?? x}</Link>)}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
