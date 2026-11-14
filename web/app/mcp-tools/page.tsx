import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { searchTools, type ToolHit } from "@/lib/tool-search";

type SP = Promise<{ q?: string; cap?: string; access?: string; src?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const base: Metadata = {
    title: "Find an MCP tool — search 350,000 tools exposed by live MCP servers",
    description: "Search the tools that hosted MCP servers really expose, tested live by Electra Index: what each tool does, whether the server answers without a key, its 30-day availability and whether the publisher is verified.",
    alternates: { canonical: "/mcp-tools" },
  };
  return sp.q || sp.cap || sp.access || sp.src ? { ...base, robots: { index: false, follow: true } } : base;
}

const EXAMPLES = ["create an invoice", "send an email", "search the web", "query a postgres database", "book a meeting", "translate text", "scrape a website", "get stock prices"];

function when(iso: string | null) {
  if (!iso) return "not checked yet";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? "checked less than an hour ago" : h < 48 ? `checked ${h} h ago` : `checked ${Math.round(h / 24)} days ago`;
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

export default async function FindMcpTool({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const cap = (sp.cap ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const access = sp.access === "open" || sp.access === "key" ? sp.access : "";
  const src = sp.src === "official" || sp.src === "community" ? sp.src : "";

  const c = db();
  const caps = c ? (((await c.from("v_capabilities").select("slug,name").order("name")).data as { slug: string; name: string }[] | null) ?? []) : [];
  const res = q ? await searchTools({ q, client: await visitor(), capability: cap, access, official: src === "official" ? true : src === "community" ? false : null }) : null;
  const capName = new Map(caps.map((x) => [x.slug, x.name]));

  return (
    <div className="ft">
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/mcp">Tools</Link><span>/</span><span className="ink">Find an MCP tool</span></nav>
      <h1 className="rl-h1">Find an MCP tool <span>· by what it does</span></h1>
      <p className="small muted" style={{ margin: "4px 0 14px" }}>Search the tools that hosted MCP servers really expose, read by our robot when it connects to them. Free for people; AI agents can use the same search through the <Link href="/mcp-server">Electra Index MCP server</Link>.</p>

      <form className="ft-form card" action="/mcp-tools" method="get" role="search">
        <label htmlFor="ftq" className="sr-only">What should the tool do?</label>
        <input id="ftq" name="q" type="search" defaultValue={q} placeholder="What should the tool do? e.g. create an invoice" autoFocus={!q} />
        <div className="ft-filters">
          <select name="cap" defaultValue={cap} aria-label="Capability">
            <option value="">All capabilities</option>
            {caps.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
          </select>
          <select name="access" defaultValue={access} aria-label="Access">
            <option value="">Any access</option>
            <option value="open">Works without a key</option>
            <option value="key">Key or sign-in required</option>
          </select>
          <select name="src" defaultValue={src} aria-label="Publisher">
            <option value="">Official and community</option>
            <option value="official">Official (verified domain)</option>
            <option value="community">Community</option>
          </select>
          <button className="btn primary" type="submit">Search</button>
        </div>
      </form>

      {!q ? (
        <div className="ft-empty">
          <p className="small muted" style={{ margin: "18px 0 8px" }}>Try:</p>
          <div className="chips">{EXAMPLES.map((e) => <Link key={e} className="chip" href={`/mcp-tools?q=${encodeURIComponent(e)}`}>{e}</Link>)}</div>
          <ul className="rs-list small muted" style={{ marginTop: 22 }}>
            <li><b>Works without a key</b>: the server answered our robot and listed its tools without credentials.</li>
            <li><b>Official</b>: the publisher proved its domain to the Official MCP Registry (e.g. <code>com.stripe/…</code>). <b>Community</b>: published under a GitHub account.</li>
            <li><b>30-day availability</b>: share of our checks the server answered (checks blocked by a key are not counted).</li>
          </ul>
        </div>
      ) : res?.error === "quota" ? (
        <p className="card" style={{ padding: 16, marginTop: 16 }}>You have reached today&apos;s free search limit. It resets tomorrow. Building an agent? Use the <Link href="/mcp-server">Electra Index MCP server</Link>.</p>
      ) : res?.error ? (
        <p className="muted" style={{ marginTop: 16 }}>Search is temporarily unavailable. Please try again in a minute.</p>
      ) : (
        <>
          <p className="small muted" style={{ margin: "16px 0 10px" }}>
            {res && res.results.length ? <>Top {res.results.length} tools for “{q}”{cap ? <> in {capName.get(cap) ?? cap}</> : null} · at most 3 per server</> : <>No tool found for “{q}”. Try fewer or simpler words.</>}
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
                  <span>{t.uptime_30d != null && t.checks_30d >= 3 ? <>{t.uptime_30d}% available over 30 days ({t.checks_30d} checks)</> : <>availability: not enough checks yet</>}</span>
                  <span>{when(t.checked_at)}</span>
                  {t.capabilities.slice(0, 3).map((x) => <Link key={x} href={`/mcp-tools?q=${encodeURIComponent(q)}&cap=${x}`}>#{capName.get(x) ?? x}</Link>)}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
