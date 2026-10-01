import Link from "next/link";
import type { Metadata } from "next";
import { db, type McpServer } from "@/lib/db";
import { num, timeAgo } from "@/lib/format";
import { Tri, Empty, SetupNotice } from "@/components/ui";

export const metadata: Metadata = { title: "Tools for AI agents (MCP servers)", description: "Every public MCP server, sourced and dated, with version, access type and history." };

const PAGE = 50;
type SP = Promise<{ q?: string; page?: string; access?: string; sort?: string }>;

function clean(q: string) {
  return q.replace(/[^\p{L}\p{N}\s\-_.]/gu, " ").trim().slice(0, 80);
}

export default async function McpIndex({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const c = db();
  if (!c) return <SetupNotice />;
  const q = clean(sp.q ?? "");
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const access = sp.access === "remote" || sp.access === "local" ? sp.access : "";
  const sort = sp.sort === "name" ? "name" : "recent";

  let query = c.from("v_mcp_servers").select("*", { count: "exact" });
  if (q) query = query.or(`name.ilike.*${q}*,short_description.ilike.*${q}*,registry_name.ilike.*${q}*`);
  if (access) query = query.eq(access, true);
  query = sort === "name" ? query.order("name") : query.order("last_seen_at", { ascending: false });
  const { data, count, error } = await query.range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data as McpServer[]) ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  const link = (p: Record<string, string | number>) => {
    const u = new URLSearchParams();
    const merged = { q, access, sort, page: 1, ...p } as Record<string, string | number>;
    Object.entries(merged).forEach(([k, v]) => { if (v !== "" && !(k === "page" && v === 1) && !(k === "sort" && v === "recent")) u.set(k, String(v)); });
    const s = u.toString();
    return `/mcp${s ? "?" + s : ""}`;
  };

  return (
    <>
      <div className="eyebrow">Index · Tools</div>
      <h1>Tools for AI agents</h1>
      <p className="lede">{num(count)} tools that AI agents plug into (MCP servers), from the Official MCP Registry, refreshed every 15 minutes. Facts are declared by publishers unless marked observed.</p>

      <form className="filters" action="/mcp" method="get">
        <label htmlFor="mq" className="sr-only">Search MCP servers</label>
        <input id="mq" name="q" type="search" defaultValue={q} placeholder="Search by name, description or registry id" />
        {access ? <input type="hidden" name="access" value={access} /> : null}
        <button className="btn" type="submit">Search</button>
        <Link href={link({ access: "" })} className={`chip ${access === "" ? "on" : ""}`}>All</Link>
        <Link href={link({ access: "remote" })} className={`chip ${access === "remote" ? "on" : ""}`}>Remote (hosted)</Link>
        <Link href={link({ access: "local" })} className={`chip ${access === "local" ? "on" : ""}`}>Local (package)</Link>
        <span className="spacer" style={{ flexGrow: 1 }} />
        <span className="small muted">Sort:</span>
        <Link href={link({ sort: "recent" })} className={`chip ${sort === "recent" ? "on" : ""}`}>Recently updated</Link>
        <Link href={link({ sort: "name" })} className={`chip ${sort === "name" ? "on" : ""}`}>Name</Link>
      </form>

      {error ? <Empty title="Could not load servers">{error.message}</Empty> : rows.length === 0 ? <Empty title="No server matches">Try another search.</Empty> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Server</th><th>Version</th><th>Access</th><th>Packages</th><th>First seen</th><th>Last seen</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/mcp/${m.slug}`} className="strong ink">{m.name}</Link>
                    <div className="mono small faint">{m.registry_name}</div>
                    <div className="desc">{m.short_description}</div>
                  </td>
                  <td className="mono">{m.version ?? "—"}</td>
                  <td><span className="pills"><Tri label="REMOTE" value={m.remote} /><Tri label="LOCAL" value={m.local} /></span></td>
                  <td className="mono small">{m.packages?.join(", ") ?? "—"}</td>
                  <td className="mono small muted">{timeAgo(m.first_seen_at)}</td>
                  <td className="mono small muted">{timeAgo(m.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pager">
        {page > 1 ? <Link className="btn" href={link({ page: page - 1 })}>← Previous</Link> : null}
        <span className="mono small muted">Page {page} / {pages}</span>
        {page < pages ? <Link className="btn" href={link({ page: page + 1 })}>Next →</Link> : null}
      </div>
    </>
  );
}
