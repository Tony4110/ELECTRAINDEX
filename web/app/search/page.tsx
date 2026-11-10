import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Empty, SetupNotice } from "@/components/ui";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };
type SP = Promise<{ q?: string }>;
type Hit = { id: string; type: string; slug: string; name: string; short_description: string | null; rank: number };

const STOP = new Set(["agent", "agents", "ai", "ia", "tool", "tools", "app", "apps", "for", "the", "and", "with", "a", "an", "to", "of", "in", "my", "de", "des", "du", "la", "le", "les", "pour", "un", "une", "et", "avec"]);
const HREF: Record<string, string> = { mcp_server: "/mcp/", task: "/tasks/", capability: "/capabilities#", agent: "/agents/" };
const LABEL: Record<string, string> = { mcp_server: "MCP server", task: "Task", capability: "Capability", agent: "Agent", category: "Category", protocol: "Protocol" };

export default async function Search({ searchParams }: { searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const q = ((await searchParams).q ?? "").trim().slice(0, 120);
  let hits: Hit[] = [];
  if (q) {
    // The database matches every word of the phrase. Visitors type several words ("seo marketing"),
    // so we also search each meaningful word and keep anything that matches at least one of them,
    // ranked by how many words it matched, then by relevance.
    const words = Array.from(new Set(
      q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9.+#-]+/).filter((w) => w.length >= 2 && !STOP.has(w)),
    )).slice(0, 6);
    const terms = words.length > 0 ? words : [q.toLowerCase()];
    const rpc = (term: string) =>
      c.rpc("search_entities", { p_q: term, p_type: null, p_limit: 60 }).then((r) => {
        if (r.error) console.error("search_entities", r.error.message);
        return (r.data as Hit[] | null) ?? [];
      });
    // Plain "contains" match on name and short description: catches forms the full-text index misses
    // (e.g. "SEO/GEO" is indexed as one token, so "seo" alone would not find it).
    const contains = (term: string) => {
      const safe = term.replace(/[^a-z0-9]/g, "");
      if (safe.length < 2) return Promise.resolve([] as Hit[]);
      return c.from("entities").select("id,type,slug,name,short_description")
        .eq("is_published", true)
        .or(`name.ilike.%${safe}%,short_description.ilike.%${safe}%`)
        .limit(60)
        .then((r) => {
          if (r.error) console.error("search_contains", r.error.message);
          return ((r.data as Omit<Hit, "rank">[] | null) ?? []).map((h) => ({ ...h, rank: 0 }));
        });
    };
    const [phrase, ...perTerm] = await Promise.all([
      rpc(q),
      ...terms.map((t) => Promise.all([rpc(t), contains(t)]).then(([a, b]) => [...a, ...b])),
    ]);
    const merged = new Map<string, Hit & { matches: number; best: number }>();
    const add = (h: Hit, gain: number) => {
      const prev = merged.get(h.id);
      if (prev) { prev.matches += gain; prev.best = Math.max(prev.best, h.rank); }
      else merged.set(h.id, { ...h, matches: gain, best: h.rank });
    };
    for (const h of phrase) add(h, terms.length);
    for (const list of perTerm) {
      const seen = new Set<string>();
      for (const h of list) { if (!seen.has(h.id)) { seen.add(h.id); add(h, 1); } }
    }
    hits = Array.from(merged.values()).sort((a, b) => b.matches - a.matches || b.best - a.best).slice(0, 60);
  }
  const tasks = hits.filter((h) => h.type === "task");
  const others = hits.filter((h) => h.type !== "task" && h.type !== "category" && h.type !== "protocol");

  return (
    <>
      <div className="eyebrow">Search</div>
      <h1>{q ? <>Results for “{q}”</> : "Search the index"}</h1>
      <form action="/search" method="get" className="search" role="search">
        <label htmlFor="sq" className="sr-only">What do you need an AI agent to do?</label>
        <input id="sq" name="q" type="search" defaultValue={q} placeholder="What do you need an AI agent to do?" />
        <button type="submit">Search →</button>
      </form>
      {q && hits.length === 0 ? <div style={{ marginTop: 24 }}><Empty title="Nothing found">Try a simpler phrase, like “leads”, “SEO” or “database”.</Empty></div> : null}
      {tasks.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ marginBottom: 12 }}>Matching tasks</h2>
          <div className="tiles">{tasks.map((t) => <Link key={t.id} href={`/tasks/${t.slug}`} className="tile"><span className="cat">Task</span><span className="name">{t.name}</span></Link>)}</div>
        </section>
      ) : null}
      {others.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ marginBottom: 12 }}>Servers, agents &amp; capabilities</h2>
          <div className="card table-wrap">
            <table>
              <tbody>
                {others.map((h) => (
                  <tr key={h.id}>
                    <td style={{ width: 140 }}><span className="badge">{(LABEL[h.type] ?? h.type).toUpperCase()}</span></td>
                    <td><Link href={`${HREF[h.type] ?? "/"}${h.slug}`} className="strong ink">{h.name}</Link><div className="desc">{h.short_description}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
