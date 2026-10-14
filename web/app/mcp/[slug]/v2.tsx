/** Tool page, version 2 (richer template). Shown to the rollout sample only, see lib/rollout.ts. */
import Link from "next/link";
import { Out } from "@/components/out";
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

export async function metadataV2({ params }: { params: P }): Promise<Metadata> {
  const m = await load((await params).slug);
  if (!m) return { title: "Not found" };
  const desc = (m.description ?? m.short_description ?? "").trim();
  const thin = desc.length < MIN_DESC;
  // Google shows ~60 characters: name + "MCP Server" first, then as much of the description as fits
  const room = 60 - (m.name.length + 13);
  const title = desc && room >= 20 ? `${m.name} MCP Server: ${cut(desc, room)}` : `${m.name} MCP Server`;
  const access = [m.remote ? "hosted" : null, m.local ? "installable" : null].filter(Boolean).join(" and ");
  return {
    title,
    description: cut(`${desc ? desc + " " : ""}${access ? `${access[0].toUpperCase()}${access.slice(1)} MCP server. ` : ""}How to connect it, capabilities, alternatives and change history.`, 158),
    alternates: { canonical: `/mcp/${m.slug}` },
    robots: thin ? { index: false, follow: true } : undefined,
  };
}

type Remote = NonNullable<McpServer["remotes"]>[number];
type Pkg = NonNullable<McpServer["package_list"]>[number];
const usableRemote = (r: Remote) => (r.type === "streamable-http" || r.type === "sse") && !/[{}]/.test(r.url);
const usablePkg = (p: Pkg) => ["npm", "pypi", "oci"].includes(p.registry ?? "") && p.transport === "stdio" && !(p.required_args ?? 0) && !(p.runtime_args ?? 0);

/** MCP client settings, generated only when the registry entry has everything needed to be correct. */
function configFor(slug: string, m: McpServer): { cfg: object; placeholders: string[] } | null {
  const r = (m.remotes ?? []).find(usableRemote);
  if (r) {
    const req = (r.headers ?? []).filter((h) => h.required);
    const entry: Record<string, unknown> = { url: r.url };
    if (req.length) entry.headers = Object.fromEntries(req.map((h) => [h.name, `<your ${h.name}>`]));
    return { cfg: { mcpServers: { [slug]: entry } }, placeholders: req.map((h) => h.name) };
  }
  const p = (m.package_list ?? []).find(usablePkg);
  if (!p) return null;
  const base = p.registry === "npm" ? { command: "npx", args: ["-y", p.identifier] }
    : p.registry === "pypi" ? { command: "uvx", args: [p.identifier] }
    : { command: "docker", args: ["run", "-i", "--rm", p.identifier] };
  const req = (p.env ?? []).filter((e) => e.required);
  const entry: Record<string, unknown> = { ...base };
  if (req.length) {
    if (p.registry === "oci") entry.args = ["run", "-i", "--rm", ...req.flatMap((e) => ["-e", e.name]), p.identifier];
    entry.env = Object.fromEntries(req.map((e) => [e.name, `<your ${e.name}>`]));
  }
  return { cfg: { mcpServers: { [slug]: entry } }, placeholders: req.map((e) => e.name) };
}

export async function ToolPageV2({ params }: { params: P }) {
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
  const conf = configFor(m.slug, m);
  const cfg = conf?.cfg ?? null;
  const secrets = [...new Set([...(m.remotes ?? []).flatMap((r) => (r.headers ?? []).filter((h) => h.required).map((h) => h.name)), ...(m.package_list ?? []).flatMap((p) => (p.env ?? []).filter((e) => e.required).map((e) => e.name))])];
  const needsArgs = (m.package_list ?? []).some((p) => (p.required_args ?? 0) > 0);
  const access = m.remote && m.local ? "can be used hosted (nothing to install) or installed locally" : m.remote ? "is hosted: an assistant connects to it over the internet, nothing to install" : m.local ? "is installed locally as a package and runs on your machine" : null;

  // only questions whose answer is specific to this tool (no generic block repeated on every page)
  const faq: { q: string; a: React.ReactNode }[] = [];
  if (remotes.length || pkgs.length) faq.push({ q: `How do I connect ${m.name}?`, a: <>{remotes.length ? <>Use the hosted endpoint <code>{remotes[0].url}</code> in your assistant&apos;s MCP settings</> : <>Install the {REGISTRY[pkgs[0].registry ?? ""] ?? pkgs[0].registry} package <code>{pkgs[0].identifier}</code></>}. The exact settings are in &quot;How to connect&quot; above, as declared in the Official MCP Registry.</> });
  if (secrets.length) faq.push({ q: `Does ${m.name} need an API key or token?`, a: <>Yes. The registry entry lists {secrets.length === 1 ? "a required value" : "required values"}: {secrets.map((x, i) => <span key={x}>{i ? ", " : ""}<code>{x}</code></span>)}. Get {secrets.length === 1 ? "it" : "them"} from the publisher.</> });
  if (tasks.length) faq.push({ q: `What can I use ${m.name} for?`, a: <>Based on its description, it is most relevant to: {tasks.slice(0, 4).map((t, i) => <span key={t.task_slug}>{i ? ", " : ""}<Link href={`/tasks/${t.task_slug}`}>{lowerFirst(t.task_name)}</Link></span>)}.</> });

  const jsonLd = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: m.name, description: desc || undefined,
    applicationCategory: "DeveloperApplication", softwareVersion: m.version ?? undefined, url: m.website ?? m.repository_url ?? undefined,
    dateModified: m.last_seen_at,
  };
  const crumbsLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Tools", item: "https://electraindex.com/mcp" },
      ...(best ? [{ "@type": "ListItem", position: 2, name: best.task_name, item: `https://electraindex.com/tasks/${best.task_slug}` }] : []),
      { "@type": "ListItem", position: best ? 3 : 2, name: m.name, item: `https://electraindex.com/mcp/${m.slug}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbsLd) }} />
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
        {m.website ? <Out type="mcp" slug={m.slug} to="website" from={`/mcp/${m.slug}`} className="btn primary">Website ↗</Out> : null}
        {m.repository_url ? <Out type="mcp" slug={m.slug} to="repository" from={`/mcp/${m.slug}`} className="btn">Source code ↗</Out> : null}
        {remotes.length || pkgs.length ? <a className="btn" href="#connect">How to connect ↓</a> : null}
      </div>

      <section className="grid cols-3" style={{ marginTop: 28 }}>
        <div className="card span-2">
          <div className="card-head"><h2>What it does</h2></div>
          <div className="card-body prose">
            <p><b>{m.name}</b> is an MCP server, a connector that lets an AI assistant use it as a tool{access ? <>. It {access}</> : null}.</p>
            {capabilities.length ? <p>From the publisher&apos;s description, Electra Index matched it to {capabilities.length === 1 ? "one capability" : `${capabilities.length} capabilities`}: {capabilities.map((x, i) => <span key={x.capability_slug}>{i ? (i === capabilities.length - 1 ? " and " : ", ") : ""}<Link href={`/mcp/best/${x.capability_slug}`}>{x.capability.toLowerCase()}</Link></span>)}.{best ? <> That makes it a candidate for tasks such as <Link href={`/tasks/${best.task_slug}`}>{lowerFirst(best.task_name)}</Link>{tasks[1] ? <> or <Link href={`/tasks/${tasks[1].task_slug}`}>{lowerFirst(tasks[1].task_name)}</Link></> : null}.</> : null}</p> : <p className="muted">No capability identified yet from its description.</p>}
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
            <div><span className="muted small">Price</span><span className="small muted">Not in the registry</span></div>
            <div><span className="muted small">First seen</span><b className="mono small">{shortDate(m.first_seen_at)}</b></div>
            <div><span className="muted small">Last checked</span><b className="mono small">{timeAgo(m.last_seen_at)}</b></div>
          </div>
        </div>
      </section>

      {remotes.length || pkgs.length ? (
        <div className="card" style={{ marginTop: 24 }} id="connect">
          <div className="card-head"><h2>How to connect</h2><span className="small muted">As declared in the Official MCP Registry · not tested by Electra Index</span></div>
          <div className="card-body prose">
            {remotes.length ? <><p className="strong" style={{ marginTop: 0 }}>Hosted endpoint{remotes.length > 1 ? "s" : ""}</p>
              <ul className="plain">{remotes.map((r) => <li key={r.url}><code>{r.url}</code> <span className="small muted">{r.type ?? ""}</span></li>)}</ul>
              {remotes.some(usableRemote) && !(remotes.find(usableRemote)?.headers ?? []).some((h) => h.required) ? <p className="small muted">In Claude Code: <code>claude mcp add --transport {remotes.find(usableRemote)!.type === "sse" ? "sse" : "http"} {m.slug} {remotes.find(usableRemote)!.url}</code></p> : null}
              {remotes.some((r) => /[{}]/.test(r.url)) ? <p className="small muted">The endpoint contains a placeholder to replace with your own value (see the publisher&apos;s docs).</p> : null}</> : null}
            {pkgs.length ? <><p className="strong">Install package{pkgs.length > 1 ? "s" : ""}</p>
              <ul className="plain">{pkgs.map((p, i) => <li key={`${p.registry}${p.identifier}${p.transport ?? ""}${i}`}><span className="badge">{(REGISTRY[p.registry ?? ""] ?? p.registry ?? "").toUpperCase()}</span> <code>{p.identifier}</code>{p.version ? <span className="small muted"> v{p.version}</span> : null}{p.transport ? <span className="small muted"> · {p.transport === "stdio" ? "runs locally (stdio)" : `runs as a server (${p.transport})`}</span> : null}</li>)}</ul></> : null}
            {secrets.length ? <p className="small"><span className="strong">Required:</span> {secrets.map((x, i) => <span key={x}>{i ? ", " : ""}<code>{x}</code></span>)} <span className="muted">(get {secrets.length === 1 ? "it" : "them"} from the publisher)</span></p> : null}
            {cfg ? <><p className="strong">MCP settings (Claude Desktop, Cursor and other MCP clients)</p><pre className="code">{JSON.stringify(cfg, null, 2)}</pre>{conf?.placeholders.length ? <p className="small muted">Replace the values in &lt;angle brackets&gt;.</p> : null}</>
              : <p className="small muted">{needsArgs ? "This package needs arguments specific to your setup, so no ready-made settings are generated: follow the publisher's instructions." : "No ready-made settings: the registry entry does not contain everything needed. Follow the publisher's instructions."}</p>}
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 24 }} id="connect">
          <div className="card-head"><h2>How to connect</h2><span className="small muted">Official MCP Registry</span></div>
          <div className="card-body prose">
            <p className="small muted" style={{ margin: 0 }}>The registry entry lists no hosted endpoint and no installable package yet, so we cannot say how to connect it. {m.repository_url || m.website ? <>Check the publisher&apos;s {m.repository_url ? <Out type="mcp" slug={m.slug} to="repository" from={`/mcp/${m.slug}`}>source code</Out> : null}{m.repository_url && m.website ? " or " : null}{m.website ? <Out type="mcp" slug={m.slug} to="website" from={`/mcp/${m.slug}`}>website</Out> : null}.</> : <>We will show it here as soon as the publisher adds it.</>}</p>
          </div>
        </div>
      )}

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
              <div className="card-head"><h2>Similar tools</h2>{best ? <span className="small muted">Listed for the same task: {lowerFirst(best.task_name)}</span> : null}</div>
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
              <div className="card-body small muted" style={{ paddingBottom: 0 }}>An MCP server is a connector you add to your own assistant. These are finished products that do the same job for you:</div>
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

      {faq.length ? <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Questions about {m.name}</h2></div>
        <div className="card-body">
          {faq.map((f) => <details key={f.q} open><summary>{f.q}</summary><p>{f.a}</p></details>)}
        </div>
      </div> : null}
    </>
  );
}
