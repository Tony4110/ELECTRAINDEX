import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, type McpServer, type Signal } from "@/lib/db";
import { shortDate, timeAgo, show, EVENT_LABEL, eventTone, describeSignal } from "@/lib/format";
import { Tri, Badge, Empty, SetupNotice } from "@/components/ui";

type P = Promise<{ slug: string }>;
type Obs = { field: string; value: unknown; evidence_level: string; confidence: string; observed_at: string; last_confirmed_at: string; sources: { code: string; name: string } | null };

const FIELD_LABEL: Record<string, string> = {
  "protocol.mcp": "MCP server", version: "Version", "registry.status": "Registry status", "repository.url": "Repository",
  "website.url": "Website", "transport.remote": "Remote access (hosted)", "transport.local": "Local install (package)", "package.registries": "Package registries",
};

async function load(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_mcp_servers").select("*").eq("slug", slug).maybeSingle();
  return data as McpServer | null;
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const m = await load((await params).slug);
  return m ? { title: `${m.name} — MCP server`, description: m.short_description ?? `${m.name} MCP server: version, access and history.` } : { title: "Not found" };
}

export default async function McpPage({ params }: { params: P }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const m = await load((await params).slug);
  if (!m) notFound();

  const [{ data: obs }, { data: hist }, { data: caps }] = await Promise.all([
    c.from("observations").select("field,value,evidence_level,confidence,observed_at,last_confirmed_at,sources(code,name)").eq("entity_id", m.id).order("observed_at", { ascending: false }),
    c.from("v_signals").select("*").eq("entity_slug", m.slug).eq("entity_type", "mcp_server").order("detected_at", { ascending: false }).limit(30),
    c.from("v_provider_capabilities").select("capability_slug,capability,evidence_level,confidence,evidence").eq("provider_slug", m.slug).eq("provider_type", "mcp_server").order("capability"),
  ]);
  const capabilities = (caps as { capability_slug: string; capability: string; evidence_level: string; confidence: string; evidence: string | null }[] | null) ?? [];
  // latest value per field + evidence level
  const seen = new Set<string>();
  const facts = ((obs as Obs[] | null) ?? []).filter((o) => { const k = o.field + o.evidence_level; if (seen.has(k)) return false; seen.add(k); return true; });
  const history = (hist as Signal[] | null) ?? [];

  const jsonLd = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: m.name, description: m.short_description ?? undefined,
    applicationCategory: "DeveloperApplication", softwareVersion: m.version ?? undefined, url: m.website ?? m.repository_url ?? undefined,
    dateModified: m.last_seen_at,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/mcp">MCP servers</Link><span>/</span><span className="ink">{m.name}</span></nav>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ width: 64, height: 64, borderRadius: 14, background: "var(--ink)", color: "#fff", fontSize: 28, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{m.name.charAt(0).toUpperCase()}</span>
        <div>
          <h1 style={{ margin: 0 }}>{m.name}</h1>
          <div className="mono small muted">{m.registry_name}</div>
        </div>
      </div>
      <p className="lede" style={{ marginTop: 16 }}>{m.short_description ?? "No description published."}</p>
      <div className="chips" style={{ marginTop: 16 }}>
        {m.website ? <a className="btn primary" href={m.website} target="_blank" rel="noopener noreferrer">Website ↗</a> : null}
        {m.repository_url ? <a className="btn" href={m.repository_url} target="_blank" rel="noopener noreferrer">Repository ↗</a> : null}
      </div>

      <div className="kv" style={{ marginTop: 28 }}>
        <div><span className="small muted">Version</span><b>{m.version ?? "—"}</b></div>
        <div><span className="small muted">Remote access</span><span><Tri label={m.remote === true ? "YES" : m.remote === false ? "NO" : "NOT DOCUMENTED"} value={m.remote} /></span></div>
        <div><span className="small muted">Local install</span><span><Tri label={m.local === true ? "YES" : m.local === false ? "NO" : "NOT DOCUMENTED"} value={m.local} /></span></div>
        <div><span className="small muted">Packages</span><b style={{ fontSize: 16 }}>{m.packages?.join(", ") ?? "—"}</b></div>
        <div><span className="small muted">First seen</span><b style={{ fontSize: 16 }}>{shortDate(m.first_seen_at)}</b></div>
        <div><span className="small muted">Last seen</span><b style={{ fontSize: 16 }}>{timeAgo(m.last_seen_at)}</b></div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Capabilities</h2><span className="small muted">Matched from the publisher&apos;s description · automatic, low confidence</span></div>
        <div className="card-body">
          {capabilities.length === 0 ? <span className="muted">No capability identified yet.</span> : (
            <div className="chips" style={{ marginTop: 0 }}>
              {capabilities.map((x) => <Link key={x.capability_slug} href={`/capabilities#${x.capability_slug}`} className="chip acc" title={x.evidence ?? ""}>{x.capability}</Link>)}
            </div>
          )}
        </div>
      </div>

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
                    <td className="mono small" style={{ wordBreak: "break-all" }}>{show(f.value)}</td>
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
    </>
  );
}
