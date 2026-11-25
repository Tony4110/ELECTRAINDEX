import Link from "next/link";
import type { Metadata } from "next";
import { db, fromCaps, type CapabilityOverview } from "@/lib/db";
import { num } from "@/lib/format";
import { Empty, SetupNotice } from "@/components/ui";
import { capIcon, capLook } from "@/lib/use-case-look";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Best MCP servers by use case",
  description: "Find the right MCP server for SEO, databases, web scraping, email, CRM and more. Every tool sourced from the Official MCP Registry, with how to connect it.",
  alternates: { canonical: "/mcp/best" },
};

export default async function BestIndex() {
  const c = db();
  if (!c) return <SetupNotice />;
  const { data } = await fromCaps((t) => c.from(t).select("*").gt("tools", 0).order("tools", { ascending: false }));
  const rows = (data as CapabilityOverview[] | null) ?? [];
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/mcp">MCP Tools</Link><span>/</span><span className="ink">Best by use case</span></nav>
      <div className="eyebrow">Tools · Use cases</div>
      <h1>Best MCP servers by use case</h1>
      <p className="lede">Pick a job to see the MCP servers that do it, which ones are hosted, which publish their code, and how to connect them.</p>
      {rows.length === 0 ? <Empty title="Temporarily unavailable">The list of use cases could not be loaded. Please try again in a few minutes.</Empty> : (
        <div className="ft-caps2" style={{ marginTop: 24 }}>
          {rows.map((r) => {
            const k = capLook(r.capability_slug);
            return (
              <Link key={r.capability_slug} href={`/mcp/best/${r.capability_slug}`} className="ft-cap2">
                <span className="ic" style={{ background: k.s, color: k.ink }}>{capIcon(r.capability_slug, r.capability)}</span>
                <span><b>{r.capability}</b><span>{num(r.tools)} servers · {num(r.hosted_tools)} hosted{r.agents ? ` · ${num(r.agents)} AI agents` : ""}</span></span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
