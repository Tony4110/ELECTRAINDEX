import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Empty, SetupNotice } from "@/components/ui";

export const metadata: Metadata = { title: "Sources & methodology", description: "Where Electra Index data comes from and the rules it follows.", alternates: { canonical: "/sources" } };

type Src = { code: string; name: string; url: string | null; layer: string | null; access: string | null; refresh: string | null };

const RULES = [
  ["No source, no claim", "Every fact, price and link carries the source it came from."],
  ["No evidence means unknown", "Missing information is shown as “not documented”, never as “no”."],
  ["No history, no change", "A variation is shown only when two real observations exist. Otherwise: Baseline."],
  ["Declared ≠ observed", "What a vendor says and what our robots check are kept apart."],
  ["Scores are methodology-versioned", "Every score shows its methodology version and a confidence level."],
  ["Sponsored is labelled", "Paid placements are always marked and never change a ranking."],
];

export default async function Sources() {
  const c = db();
  if (!c) return <SetupNotice />;
  const { data } = await c.from("sources").select("code,name,url,layer,access,refresh").order("code");
  const srcs = (data as Src[] | null) ?? [];
  return (
    <>
      <div className="eyebrow">Methodology</div>
      <h1>Sources &amp; rules</h1>
      <div className="tiles" style={{ marginTop: 24 }}>
        {RULES.map(([t, d]) => <div key={t} className="tile"><span className="name">{t}</span><span className="small muted">{d}</span></div>)}
      </div>
      <h2 id="affiliates" style={{ margin: "40px 0 12px" }}>Affiliate links &amp; neutrality</h2>
      <p className="muted" style={{ maxWidth: 760 }}>Some &quot;Visit website&quot; buttons are affiliate links: if you subscribe through them, the vendor may pay Electra Index a commission, at no extra cost to you. These links are labelled on the page. Affiliate status is stored apart from the index and is never read by the Agent Score, the value label or any ranking. A vendor cannot pay to move up, and a vendor without a program is ranked exactly the same way.</p>
      <h2 id="live-check" style={{ margin: "40px 0 12px" }}>Live check of hosted MCP servers</h2>
      <p className="muted" style={{ maxWidth: 760 }}>For MCP servers with a hosted endpoint, our robot (user agent <code>ElectraIndexBot</code>) opens an MCP session exactly as an AI assistant would and asks for the list of tools. It never runs a tool and never sends a key or token. A server is shown as <b>online</b> when it answers, <b>reachable, key or sign-in required</b> when it asks for credentials, and <b>not responding</b> only after two failed checks in a row. Each server is checked every few days, with at most a few requests per host at a time. Publishers who prefer not to be checked can write to contact@electraindex.com.</p>
      <h2 style={{ margin: "40px 0 12px" }}>Active sources <span className="muted small mono">· {srcs.length}</span></h2>
      {srcs.length === 0 ? <Empty title="No active source" /> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Source</th><th>Layer</th><th>Access</th><th>Refresh</th></tr></thead>
            <tbody>
              {srcs.map((s) => (
                <tr key={s.code}>
                  <td className="mono small muted">{s.code}</td>
                  <td className="strong">{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}</td>
                  <td className="small">{s.layer}</td>
                  <td className="small">{s.access}</td>
                  <td className="small muted">{s.refresh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
