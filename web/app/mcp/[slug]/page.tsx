import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, type McpServer, type Signal, type TaskRanking } from "@/lib/db";
import { shortDate, timeAgo, show, EVENT_LABEL, eventTone, describeSignal, lowerFirst } from "@/lib/format";
import { Tri, Badge, Empty, SetupNotice } from "@/components/ui";
import { Coverage, Quality, Price, Logo } from "@/components/rank";
import { MIN_DESC } from "@/lib/site";

type P = Promise<{ slug: string }>;
type Obs = { field: string; value: unknown; evidence_level: string; confidence: string; observed_at: string; last_confirmed_at: string; sources: { code: string; name: string } | null };

const FIELD_LABEL: Record<string, string> = {
  "protocol.mcp": "MCP server", version: "Version", "registry.status": "Registry status", "repository.url": "Repository",
  "website.url": "Website", "transport.remote": "Remote access (hosted)", "transport.local": "Local install (package)", "package.registries": "Package registries",
  "mcp.remotes": "Hosted endpoint", "mcp.packages": "Install package",
};
const REGISTRY: Record<string, string> = { npm: "npm", pypi: "PyPI", oci: "Docker", nuget: "NuGet", mcpb: "MCP bundle" };

async function load(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_mcp_servers").select("*").eq("slug", slug).maybeSingle();
  return data as McpServer | null;
}

function cut(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t.replace(/[.\s]+$/, "");
  return t.slice(0, n).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + "…";
}

// rendered on first visit, then cached and refreshed hourly
export async function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const m = await load((await params).slug);
  if (!m) return { title: "Not found" };
  const desc = (m.description ?? m.short_description ?? "").trim();
  const thin = desc.length < MIN_DESC;
  const title = desc ? `${m.name} MCP Server: ${cut(desc, Math.max(24, 62 - m.name.length))}` : `${m.name} MCP Server`;
  const access = [m.remote ? "hosted" : null, m.local ? "installable" : null].filter(Boolean).join(" and ");
  return {
    title,
    description: cut(`${desc ? desc + " " : ""}${access ? `${access[0].toUpperCase()}${access.slice(1)} MCP server. ` : ""}How to connect it, capabilities, alternatives and change history.`, 158),
    alternates: { canonical: `/mcp/${m.slug}` },
    robots: thin ? { index: false, follow: true } : undefined,
  };
}

function configFor(slug: string, m: McpServer) {
  const r = (m.remotes ?? [])[0];
  if (r) return { mcpServers: { [slug]: { url: r.url } } };
  const p = (m.package_list ?? []).find((x) => ["npm", "pypi", "oci"].includes(x.registry ?? ""));
  if (!p) return null;
  if (p.registry === "npm") return { mcpServers: { [slug]: { command: "npx", args: ["-y", p.identifier] } } };
  if (p.registry === "pypi") return { mcpServers: { [slug]: { command: "uvx", args: [p.identifier] } } };
  return { mcpServers: { [slug]: { command: "docker", args: ["run", "-i", "--rm", p.identifier] } } };
}

export default async function McpPage({ params }: { params: P }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const m = await load((await params).slug);
  if (!m) notFound();

  const [{ data: obs }, { data: hist }, { data: caps }, { data: tr }] = await Promise.all([
    c.from("observations").select("field,value,evidence_level,confidence,observed_at,last_confirmed_at,sources(code,name)").eq("entity_id", m.id).order("observed_at", { ascending: false }),
    c.from("v_signals").select("*").eq("entity_slug", m.slug).eq("entity_type", "mcp_server").order("detected_at", { ascending: false }).limit(30),
    c.from("v_provider_capabilities").select("capability_slug,capability,evidence_level,confidence,evidence").eq("provider_slug", m.slug).eq("provider_type", "mcp_server").order("capability"),
    c.from("v_task_rankings").select("task_slug,task_name,coverage_pct,matched_capabilities").eq("provider_id", m.id).order("coverage_pct", { ascending: false }).limit(30),
  ]);
  const capabilities = (caps as { capability_slug: string; capability: string; evidence: string | null }[] | null) ?? [];
  // at equal coverage, prefer tasks whose words or matched capabilities appear in the tool's own description
  const text = `${m.name} ${m.description ?? m.short_description ?? ""}`.toLowerCase();
  const hits = (t: { task_name: string; matched_capabilities: string[] | null }) =>
    [...t.task_name.split(/\W+/), ...(t.matched_capabilities ?? []).flatMap((c) => c.split(/\W+/))]
      .filter((w) => w.length > 2 && !["the", "and", "for", "with", "data"].includes(w.toLowerCase()) && text.includes(w.toLowerCase())).length;
  const tasks = ((tr as Pick<TaskRanking, "task_slug" | "task_name" | "coverage_pct" | "matched_capabilities">[] | null) ?? [])
    .map((t) => ({ ...t, h: hits(t) }))
    .sort((a, b) => b.coverage_pct - a.coverage_pct || b.h - a.h || a.task_name.localeCompare(b.task_name))
    .slice(0, 8);
  const best = tasks[0];
  const [{ data: simData }, { data: agData }] = best ? await Promise.all([
    c.from("v_task_rankings").select("provider_slug,provider_name,short_description,coverage_pct,remote,local").eq("task_slug", best.task_slug).eq("provider_type", "mcp_server").neq("provider_id", m.id).order("coverage_pct", { ascending: false }).order("last_seen_at", { ascending: false }).limit(6),
    c.from("v_task_rankings").select("provider_slug,provider_name,quality_score,from_usd_month,has_free,has_pricing,coverage_pct").eq("task_slug", best.task_slug).eq("provider_type", "agent").order("coverage_pct", { ascending: false }).order("quality_score", { ascending: false, nullsFirst: false }).limit(3),
  ]) : [{ data: [] }, { data: [] }];
  const similar = (simData as { provider_slug: string; provider_name: string; short_description: string | null; coverage_pct: number; remote: boolean | null; local: boolean | null }[] | null) ?? [];
  const agents = (agData as { provider_slug: string; provider_name: string; quality_score: number | null; from_usd_month: number | null; has_free: boolean; has_pricing: boolean }[] | null) ?? [];

  const seen = new Set<string>();
  const facts = ((obs as Obs[] | null) ?? []).filter((o) => { const k = o.field + o.evidence_level; if (seen.has(k)) return false; seen.add(k); return true; });
  const history = (hist as Signal[] | null) ?? [];
  const desc = (m.description ?? m.short_description ?? "").trim();
  const remotes = m.remotes ?? [];
  const pkgs = m.package_list ?? [];
  const cfg = configFor(m.slug, m);
  const access = m.remote && m.local ? "can be used hosted (nothing to install) or installed locally" : m.remote ? "is hosted: an assistant connects to it over the internet, nothing to install" : m.local ? "is installed locally as a package and runs on your machine" : null;

  const faq: { q: string; a: React.ReactNode }[] = [
    { q: `What is ${m.name}?`, a: <>{m.name} is an MCP server{desc ? <>: {lowerFirst(desc.replace(/\.$/, ""))}.</> : "."} MCP (Model Context Protocol) servers are connectors that let AI assistants such as Claude, ChatGPT or Cursor use a tool directly.</> },
    { q: `How do I connect ${m.name}?`, a: remotes.length || pkgs.length ? <>Add it to your assistant&apos;s MCP settings{remotes.length ? <> with the hosted endpoint <code>{remotes[0].url}</code></> : <> by installing the {REGISTRY[pkgs[0].registry ?? ""] ?? pkgs[0].registry} package <code>{pkgs[0].identifier}</code></>}. See &quot;How to connect&quot; above. Check the publisher&apos;s documentation for any API key it needs.</> : <>The registry entry does not document an endpoint or package yet. Use the publisher&apos;s website or repository.</> },
    { q: `Is ${m.name} free?`, a: <>No price is published in the official MCP registry for this server. Pricing, if any, is set by the publisher: check {m.website ? <a href={m.website} target="_blank" rel="noopener noreferrer">their website</a> : "their website"}.</> },
    ...(tasks.length ? [{ q: `What can I use ${m.name} for?`, a: <>Based on its description, it is most relevant to: {tasks.slice(0, 4).map((t, i) => <span key={t.task_slug}>{i ? ", " : ""}<Link href={`/tasks/${t.task_slug}`}>{lowerFirst(t.task_name)}</Link></span>)}.</> }] : []),
  ];

  const jsonLd = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: m.name, description: desc || undefined,
    applicationCategory: "DeveloperApplication", softwareVersion: m.version ?? undefined, url: m.website ?? m.repository_url ?? undefined,
    dateModified: m.last_seen_at,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/mcp">Tools</Link><span>/</span>{best ? <><Link href={`/tasks/${best.task_slug}`}>{best.task_name}</Link><span>/</span></> : null}<span className="ink">{m.name}</span></nav>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <Logo name={m.name} website={m.website ?? m.repository_url} size={64} />
        <div>
          <h1 style={{ margin: 0 }}>{m.name}</h1>
          <div className="small muted">MCP server{m.remote ? " · hosted" : ""}{m.local ? " · installable" : ""}{m.version ? ` · v${m.version}` : ""} <span className="mono faint">· {m.registry_name}</span></div>
        </div>
      </div>
      <p className="lede" style={{ marginTop: 16, maxWidth: "80ch" }}>{desc || "No description published."}</p>
      <div className="chips" style={{ marginTop: 16 }}>
        {m.website ? <a className="btn primary" href={m.website} target="_blank" rel="noopener noreferrer">Website ↗</a> : null}
        {m.repository_url ? <a className="btn" href={m.repository_url} target="_blank" rel="noopener noreferrer">Source code ↗</a> : null}
        {cfg ? <a className="btn" href="#connect">How to connect ↓</a> : null}
      </div>

      <section className="grid cols-3" style={{ marginTop: 28 }}>
        <div className="card span-2">
          <div className="card-head"><h2>What it does</h2></div>
          <div className="card-body prose">
            <p><b>{m.name}</b> is an MCP server, a connector that lets an AI assistant use it as a tool{access ? <>. It {access}</> : null}.</p>
            {capabilities.length ? <p>From the publisher&apos;s description, Electra Index matched it to {capabilities.length === 1 ? "one capability" : `${capabilities.length} capabilities`}: {capabilities.map((x, i) => <span key={x.capability_slug}>{i ? (i === capabilities.length - 1 ? " and " : ", ") : ""}<Link href={`/capabilities#${x.capability_slug}`}>{x.capability.toLowerCase()}</Link></span>)}.{best ? <> That makes it a candidate for tasks such as <Link href={`/tasks/${best.task_slug}`}>{lowerFirst(best.task_name)}</Link>{tasks[1] ? <> or <Link href={`/tasks/${tasks[1].task_slug}`}>{lowerFirst(tasks[1].task_name)}</Link></> : null}.</> : null}</p> : <p className="muted">No capability identified yet from its description.</p>}
            <p className="small muted">Facts come from the Official MCP Registry, as declared by the publisher. Capabilities are matched automatically (low confidence) and are not a test of the tool.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>At a glance</h2></div>
          <div className="glance">
            <div><span className="muted small">Hosted (remote)</span><Tri label={m.remote === true ? "YES" : m.remote === false ? "NO" : "NOT DOCUMENTED"} value={m.remote} /></div>
            <div><span className="muted small">Local install</span><Tri label={m.local === true ? "YES" : m.local === false ? "NO" : "NOT DOCUMENTED"} value={m.local} /></div>
            <div><span className="muted small">Version</span><b className="mono">{m.version ?? "—"}</b></div>
            {pkgs.length ? <div><span className="muted small">Packages</span><b className="small">{[...new Set(pkgs.map((p) => REGISTRY[p.registry ?? ""] ?? p.registry))].join(", ")}</b></div> : null}
            <div><span className="muted small">Price</span><span className="small muted">Not published</span></div>
            <div><span className="muted small">First seen</span><b className="mono small">{shortDate(m.first_seen_at)}</b></div>
            <div><span className="muted small">Last checked</span><b className="mono small">{timeAgo(m.last_seen_at)}</b></div>
          </div>
        </div>
      </section>

      {cfg || remotes.length || pkgs.length ? (
        <div className="card" style={{ marginTop: 24 }} id="connect">
          <div className="card-head"><h2>How to connect</h2><span className="small muted">Generated from the registry entry · check the publisher&apos;s docs for API keys</span></div>
          <div className="card-body prose">
            {remotes.length ? <><p className="strong" style={{ marginTop: 0 }}>Hosted endpoint{remotes.length > 1 ? "s" : ""}</p>
              <ul className="plain">{remotes.map((r) => <li key={r.url}><code>{r.url}</code> <span className="small muted">{r.type ?? ""}</span></li>)}</ul>
              <p className="small muted">In Claude Code: <code>claude mcp add --transport {remotes[0].type === "sse" ? "sse" : "http"} {m.slug} {remotes[0].url}</code></p></> : null}
            {pkgs.length ? <><p className="strong">Install package{pkgs.length > 1 ? "s" : ""}</p>
              <ul className="plain">{pkgs.map((p) => <li key={`${p.registry}${p.identifier}`}><span className="badge">{(REGISTRY[p.registry ?? ""] ?? p.registry ?? "").toUpperCase()}</span> <code>{p.identifier}</code>{p.version ? <span className="small muted"> v{p.version}</span> : null}</li>)}</ul></> : null}
            {cfg ? <><p className="strong">MCP settings (Claude Desktop, Cursor and other MCP clients)</p><pre className="code">{JSON.stringify(cfg, null, 2)}</pre></> : null}
          </div>
        </div>
      ) : null}

      {tasks.length ? (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head"><h2>Tasks it helps with</h2><span className="small muted">Share of each task&apos;s required capabilities it covers</span></div>
          <div className="table-wrap"><table><tbody>
            {tasks.map((t) => <tr key={t.task_slug}><td><Link href={`/tasks/${t.task_slug}`} className="strong ink">{t.task_name}</Link><div className="small muted">{(t.matched_capabilities ?? []).join(" · ")}</div></td><td style={{ width: 200 }}><Coverage pct={t.coverage_pct} /></td></tr>)}
          </tbody></table></div>
        </div>
      ) : null}

      {similar.length || agents.length ? (
        <section className="grid cols-3" style={{ marginTop: 24 }}>
          {similar.length ? (
            <div className="card span-2">
              <div className="card-head"><h2>Similar tools</h2>{best ? <span className="small muted">Also used to {lowerFirst(best.task_name)}</span> : null}</div>
              <ul className="signals">{similar.map((s) => (
                <li className="signal" key={s.provider_slug}>
                  <div className="signal-top"><Link href={`/mcp/${s.provider_slug}`} className="strong ink">{s.provider_name}</Link><span className="spacer" /><span className="pills"><Tri label="REMOTE" value={s.remote} /><Tri label="LOCAL" value={s.local} /></span></div>
                  {s.short_description ? <div className="small muted">{cut(s.short_description, 140)}</div> : null}
                </li>))}</ul>
            </div>
          ) : null}
          {agents.length ? (
            <div className="card">
              <div className="card-head"><h2>Ready-made AI agents</h2></div>
              <div className="card-body small muted" style={{ paddingBottom: 0 }}>Prefer a product over a connector? Commercial agents for the same job:</div>
              <ul className="signals">{agents.map((a) => (
                <li className="signal" key={a.provider_slug}>
                  <div className="signal-top"><Link href={`/agents/${a.provider_slug}`} className="strong ink">{a.provider_name}</Link><span className="spacer" /><Quality score={a.quality_score} /></div>
                  <div className="small"><Price from={a.from_usd_month} free={a.has_free} hasPricing={a.has_pricing} /></div>
                </li>))}</ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid cols-3" style={{ marginTop: 24 }}>
        <div className="card span-2">
          <div className="card-head"><h2>Facts &amp; evidence</h2><span className="small muted">Each fact shows where it was seen and when.</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fact</th><th>Value</th><th>Evidence</th><th>Source</th><th>Last confirmed</th></tr></thead>
              <tbody>
                {facts.map((f) => (
                  <tr key={f.field + f.evidence_level}>
                    <td className="strong">{FIELD_LABEL[f.field] ?? f.field}</td>
                    <td className="mono small" style={{ wordBreak: "break-all" }}>{f.field === "mcp.remotes" ? ((f.value as { url: string }[]) ?? []).map((x) => x.url).join(", ") : f.field === "mcp.packages" ? ((f.value as { identifier: string }[]) ?? []).map((x) => x.identifier).join(", ") : show(f.value)}</td>
                    <td><Badge tone={f.evidence_level === "observed" ? "pos" : "plain"}>{f.evidence_level.toUpperCase()}</Badge></td>
                    <td className="small">{f.sources ? <><span className="mono faint">{f.sources.code}</span> {f.sources.name}</> : "—"}</td>
                    <td className="mono small muted">{timeAgo(f.last_confirmed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Change history</h2></div>
          {history.length === 0 ? <div className="card-body"><Empty title="Baseline">No change detected yet. History builds up as the robots revisit this server.</Empty></div> : (
            <ul className="signals">
              {history.map((h) => (
                <li className="signal" key={h.id}>
                  <div className="signal-top"><Badge tone={eventTone(h.event_type)}>{EVENT_LABEL[h.event_type] ?? h.event_type}</Badge><span className="mono small muted">{shortDate(h.detected_at)}</span></div>
                  <div className="muted">{describeSignal(h)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Questions about {m.name}</h2></div>
        <div className="card-body">
          {faq.map((f) => <details key={f.q} open><summary>{f.q}</summary><p>{f.a}</p></details>)}
        </div>
      </div>
    </>
  );
}
