import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { searchTools, type ToolHit } from "@/lib/tool-search";
import { num } from "@/lib/format";

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

const EXAMPLES = ["create an invoice", "send an email", "search the web", "query postgres", "book a meeting", "scrape a website"];

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

  const [res, liveRow, capRows] = await Promise.all([
    q ? searchTools({ q, client: await visitor(), capability: cap, access, official: src === "official" ? true : src === "community" ? false : null }) : Promise.resolve(null),
    c ? c.from("v_research_live").select("data").maybeSingle().then((r) => (r.data as { data: Live } | null)?.data ?? null) : Promise.resolve(null),
    c ? c.from("v_capability_overview").select("capability_slug,capability,tools").gt("tools", 0).order("tools", { ascending: false }).limit(18).then((r) => (r.data as Cap[] | null) ?? []) : Promise.resolve([] as Cap[]),
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
      <h1 className="rl-h1">MCP Tools <span>· find what your AI agent can connect to</span></h1>
      <p className="small muted" style={{ margin: "4px 0 14px" }}>
        {m ? <>{num(m.tools)} tools from {num(m.online_tools)} MCP servers that answered our robot · tested every day · </> : null}
        <Link href="/sources#live-check">how we test</Link>
      </p>

      <form className="ft-form card ft-hero" action="/mcp" method="get" role="search">
        <label htmlFor="ftq" className="ft-hero-l">What should your agent be able to do?</label>
        <div className="ft-hero-row">
          <input id="ftq" name="q" type="search" defaultValue={q} placeholder="e.g. create an invoice, send an email, query postgres" />
          <button className="btn primary" type="submit">Find tools</button>
        </div>
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
      </form>

      {!q ? (
        <>
          <div className="chips" style={{ marginTop: 4 }}><span className="small muted">Try:</span>{EXAMPLES.map((e) => <Link key={e} className="chip" href={`/mcp?q=${encodeURIComponent(e)}`}>{e}</Link>)}</div>

          {capRows.length ? (
            <>
              <h2 className="ft-h2">Or browse by use case</h2>
              <div className="ft-caps">
                {capRows.map((x) => (
                  <Link key={x.capability_slug} href={`/mcp/best/${x.capability_slug}`} className="ft-cap">
                    <b>{x.capability}</b><span>{num(x.tools)} servers</span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          <div className="ft-help">
            <div><b>Works without a key</b><span>The server answered and listed its tools with no credentials.</span></div>
            <div><b>Official</b><span>The publisher proved its domain to the Official MCP Registry (e.g. com.stripe/…).</span></div>
            <div><b>30-day availability</b><span>Share of our checks it answered. Checks blocked by a key are not counted.</span></div>
          </div>
          <p className="small muted" style={{ marginTop: 18 }}>
            <Link href="/mcp/directory">Browse all {m ? num(m.servers) : ""} servers</Link> · <Link href="/mcp/best">Best servers by use case</Link> · <Link href="/research">Live data &amp; reports</Link> · <Link href="/mcp-server">Use this search from your AI agent (MCP)</Link>
          </p>
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
                  <span>{t.uptime_30d != null && t.checks_30d >= 3 ? <>{t.uptime_30d}% available over 30 days</> : <>availability: not enough checks yet</>}</span>
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
