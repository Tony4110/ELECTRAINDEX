import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, MIN_TOOLS_FOR_INDEX, type AgentCard, type CapabilityOverview, type CapabilityTool } from "@/lib/db";
import { SITE } from "@/lib/site";
import { num, timeAgo, useCase, lowerFirst } from "@/lib/format";
import { Tri, Empty, SetupNotice } from "@/components/ui";
import { Quality, Price } from "@/components/rank";

export const revalidate = 3600;
export async function generateStaticParams() { return []; }

type P = Promise<{ capability: string }>;
type SP = Promise<{ page?: string }>;
const PAGE = 50;

async function load(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_capability_overview").select("*").eq("capability_slug", slug).maybeSingle();
  return data as CapabilityOverview | null;
}

const list = (names: string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export async function generateMetadata({ params, searchParams }: { params: P; searchParams: SP }): Promise<Metadata> {
  const o = await load((await params).capability);
  if (!o || o.tools === 0) return { title: "Not found" };
  const page = parseInt((await searchParams).page ?? "1", 10) || 1;
  const uc = useCase(o.capability);
  return {
    title: `Best MCP servers for ${uc} (${new Date().getFullYear()})`,
    description: `${num(o.tools)} MCP servers for ${uc}, ${num(o.hosted_tools)} hosted. Compare relevance, how to connect and source code, from the Official MCP Registry.`,
    alternates: { canonical: `/mcp/best/${o.capability_slug}` },
    robots: o.tools < MIN_TOOLS_FOR_INDEX || page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function BestFor({ params, searchParams }: { params: P; searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const o = await load((await params).capability);
  if (!o || o.tools === 0) notFound();
  const page = Math.max(1, parseInt((await searchParams).page ?? "1", 10) || 1);
  const uc = useCase(o.capability);

  const [{ data: tl }, { data: ag }, { data: tk }, { data: rel }] = await Promise.all([
    c.from("v_capability_tools").select("*").eq("capability_slug", o.capability_slug)
      .order("name_match", { ascending: false }).order("remote", { ascending: false }).order("has_source", { ascending: false }).order("last_seen_at", { ascending: false })
      .range((page - 1) * PAGE, page * PAGE - 1),
    c.from("v_provider_capabilities").select("provider_slug").eq("capability_slug", o.capability_slug).eq("provider_type", "agent").limit(200),
    c.from("v_tasks").select("slug,name").contains("capabilities", [{ slug: o.capability_slug }]).limit(8),
    c.from("v_capability_overview").select("capability_slug,capability,tools").gte("tools", MIN_TOOLS_FOR_INDEX).neq("capability_slug", o.capability_slug).order("tools", { ascending: false }).limit(8),
  ]);
  const tools = (tl as CapabilityTool[] | null) ?? [];
  const agentSlugs = ((ag as { provider_slug: string }[] | null) ?? []).map((x) => x.provider_slug);
  const { data: ac } = agentSlugs.length
    ? await c.from("v_agent_cards").select("slug,name,short_description,quality_score,from_usd_month,has_free").in("slug", agentSlugs).order("quality_score", { ascending: false, nullsFirst: false }).limit(6)
    : { data: [] };
  const agents = (ac as Pick<AgentCard, "slug" | "name" | "short_description" | "quality_score" | "from_usd_month" | "has_free">[] | null) ?? [];
  const tasks = (tk as { slug: string; name: string }[] | null) ?? [];
  const related = (rel as { capability_slug: string; capability: string; tools: number }[] | null) ?? [];
  const pages = Math.max(1, Math.ceil(o.tools / PAGE));
  const top = page === 1 ? tools.slice(0, 3) : [];
  const hostedTop = tools.filter((t) => t.remote).slice(0, 3);

  const faq: { q: string; a: string }[] = [];
  if (top.length) faq.push({ q: `What is the best MCP server for ${uc}?`, a: `By relevance and readiness, ${list(top.map((t) => t.tool_name))} come first: ${top[0].name_match ? "the use case appears in their name" : "the use case appears in their description"}${top[0].remote ? " and they can be used as a hosted endpoint" : ""}. Check each page for how to connect and what keys it needs.` });
  faq.push({ q: `How many MCP servers are there for ${uc}?`, a: `Electra Index lists ${num(o.tools)} active MCP servers for ${uc} from the Official MCP Registry. ${num(o.hosted_tools)} offer a hosted endpoint and ${num(o.open_source_tools)} publish their source code.` });
  if (hostedTop.length) faq.push({ q: `Is there a hosted MCP server for ${uc}, with nothing to install?`, a: `Yes. ${list(hostedTop.map((t) => t.tool_name))} ${hostedTop.length === 1 ? "declares" : "declare"} a remote endpoint you add to your assistant's MCP settings.` });
  if (agents.length) faq.push({ q: `Is there a ready-made AI agent for ${uc} instead?`, a: `Yes. If you prefer a finished product to plugging tools into your own assistant, ${list(agents.slice(0, 3).map((a) => a.name))} ${agents.length === 1 ? "does" : "do"} this out of the box.` });

  const url = `${SITE}/mcp/best/${o.capability_slug}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "ItemList", name: `Best MCP servers for ${uc}`, url, numberOfItems: o.tools,
      itemListElement: tools.slice(0, 10).map((t, i) => ({ "@type": "ListItem", position: (page - 1) * PAGE + i + 1, url: `${SITE}/mcp/${t.tool_slug}`, name: t.tool_name })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Tools", item: `${SITE}/mcp` },
      { "@type": "ListItem", position: 2, name: "Best by use case", item: `${SITE}/mcp/best` },
      { "@type": "ListItem", position: 3, name: o.capability, item: url } ] },
  ];

  return (
    <>
      {ld.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x) }} />)}
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/mcp">Tools</Link><span>/</span><Link href="/mcp/best">Best by use case</Link><span>/</span><span className="ink">{o.capability}</span></nav>
      <div className="eyebrow">Tools · {o.capability}</div>
      <h1>Best MCP servers for {uc}</h1>
      <p className="lede">
        {num(o.tools)} MCP servers in the Official MCP Registry do {uc}. {num(o.hosted_tools)} can be used as a hosted endpoint, with nothing to install, and {num(o.open_source_tools)} publish their source code.
        {top.length ? <> First by relevance and readiness: {top.map((t, i) => <span key={t.tool_slug}>{i ? (i === top.length - 1 ? " and " : ", ") : ""}<Link href={`/mcp/${t.tool_slug}`}>{t.tool_name}</Link></span>)}.</> : null}
      </p>

      <section className="grid cols-3">
        <div className="card span-2 table-wrap">
          {tools.length === 0 ? <div className="card-body"><Empty title="No tool on this page" /></div> : (
            <table>
              <thead><tr><th>#</th><th>Tool</th><th>Relevance</th><th>Connect</th><th>Code</th><th>Seen</th></tr></thead>
              <tbody>
                {tools.map((t, i) => (
                  <tr key={t.tool_id}>
                    <td className="rank-num">{(page - 1) * PAGE + i + 1}</td>
                    <td><Link href={`/mcp/${t.tool_slug}`} className="strong ink">{t.tool_name}</Link>{t.short_description ? <div className="desc">{t.short_description}</div> : null}</td>
                    <td className="small">{t.name_match ? <span className="badge accent">In name</span> : <span className="badge">In description</span>}{t.keywords ? <div className="mono faint small">{t.keywords}</div> : null}</td>
                    <td><span className="pills"><Tri label="HOSTED" value={t.remote} /><Tri label="LOCAL" value={t.local} /></span></td>
                    <td className="small">{t.has_source ? "Open" : <span className="faint">—</span>}</td>
                    <td className="mono small muted">{timeAgo(t.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Ready-made AI agents</h2></div>
          {agents.length === 0 ? <div className="card-body"><span className="muted small">No AI agent documents this capability yet.</span></div> : (
            <ul className="signals">
              {agents.map((a) => (
                <li className="signal" key={a.slug}>
                  <div className="signal-top"><Link href={`/agents/${a.slug}`} className="strong ink">{a.name}</Link><span className="spacer" /><Quality score={a.quality_score} /></div>
                  <div className="small"><Price from={a.from_usd_month} free={a.has_free} hasPricing /></div>
                </li>
              ))}
            </ul>
          )}
          {tasks.length ? <>
            <div className="card-head" style={{ borderTop: "1px solid var(--line)" }}><h2>Tasks that need it</h2></div>
            <ul className="signals">{tasks.map((t) => <li className="signal" key={t.slug}><Link href={`/tasks/${t.slug}`}>{t.name}</Link></li>)}</ul>
          </> : null}
          {related.length ? <>
            <div className="card-head" style={{ borderTop: "1px solid var(--line)" }}><h2>Other use cases</h2></div>
            <ul className="signals">{related.map((r) => <li className="signal" key={r.capability_slug}><Link href={`/mcp/best/${r.capability_slug}`}>MCP servers for {useCase(r.capability)}</Link> <span className="mono small faint">{num(r.tools)}</span></li>)}</ul>
          </> : null}
        </div>
      </section>
      {pages > 1 ? <div className="pager">
        {page > 1 ? <Link className="btn" href={`/mcp/best/${o.capability_slug}${page > 2 ? `?page=${page - 1}` : ""}`}>← Previous</Link> : null}
        <span className="mono small muted">Page {page} / {pages}</span>
        {page < pages ? <Link className="btn" href={`/mcp/best/${o.capability_slug}?page=${page + 1}`}>Next →</Link> : null}
      </div> : null}

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>FAQ</h2></div>
        <div className="card-body">{faq.map((f) => <details key={f.q} open><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
      <p className="note">How this list is ordered: a tool comes first when the use case appears in its name rather than only in its description, then when it offers a hosted endpoint, then when its source code is public, then by how recently our robot saw it in the Official MCP Registry. The match to {lowerFirst(o.capability)} comes from the publisher&apos;s description (keyword method), not from a test of the tool. Only active tools with a real description are listed. No tool pays to appear here.</p>
    </>
  );
}
