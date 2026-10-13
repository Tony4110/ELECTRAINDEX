import Link from "next/link";
import type { Metadata } from "next";
import { db, type CapabilityOverview } from "@/lib/db";
import { num, useCase } from "@/lib/format";
import { Empty, SetupNotice } from "@/components/ui";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Best MCP servers by use case",
  description: "Find the right MCP server for SEO, databases, web scraping, email, CRM and more. Every tool sourced from the Official MCP Registry, with how to connect it.",
  alternates: { canonical: "/mcp/best" },
};

export default async function BestIndex() {
  const c = db();
  if (!c) return <SetupNotice />;
  const { data } = await c.from("v_capability_overview").select("*").gt("tools", 0).order("tools", { ascending: false });
  const rows = (data as CapabilityOverview[] | null) ?? [];
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/mcp">Tools</Link><span>/</span><span className="ink">Best by use case</span></nav>
      <div className="eyebrow">Tools · Use cases</div>
      <h1>Best MCP servers by use case</h1>
      <p className="lede">Pick a job to see the MCP servers that do it, which ones are hosted, which publish their code, and how to connect them.</p>
      {rows.length === 0 ? <Empty title="Not ready yet">Our robots are still classifying tools by capability.</Empty> : (
        <div className="tiles" style={{ marginTop: 24 }}>
          {rows.map((r) => (
            <Link key={r.capability_slug} href={`/mcp/best/${r.capability_slug}`} className="tile">
              <span className="name">MCP servers for {useCase(r.capability)}</span>
              <span className="small muted">{num(r.tools)} tools · {num(r.hosted_tools)} hosted{r.agents ? ` · ${num(r.agents)} AI agents` : ""}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
