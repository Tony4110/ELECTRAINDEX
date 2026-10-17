import { timeAgo, shortDate } from "@/lib/format";
import type { LiveCheck } from "@/lib/db";

const FAIL: Record<string, string> = {
  not_found: "nothing found at the endpoint address",
  not_mcp: "the address answered, but not as an MCP server",
  error: "server error",
  timeout: "no answer within 15 seconds",
  unreachable: "the address could not be reached",
};

/** Badge under the page title. */
export function LiveBadge({ live }: { live: LiveCheck | null }) {
  if (!live) return null;
  if (live.status === "online") return <span className="badge live-ok"><span className="dot live" />Online · tested {timeAgo(live.checked_at)}</span>;
  if (live.status === "auth_required") return <span className="badge trust">Reachable · key or sign-in required</span>;
  if (live.status === "down") return <span className="badge attn"><span className="dot ember" />Not responding · {timeAgo(live.checked_at)}</span>;
  return null;
}

/** "Live check" card: what happened when Electra Index connected to the hosted endpoint. */
export function LiveCheckCard({ live, name }: { live: LiveCheck; name: string }) {
  const tools = live.tools ?? [];
  const first = tools.slice(0, 12);
  const rest = tools.slice(12);
  return (
    <div className="card live-card" style={{ marginTop: 24 }} id="live-check">
      <div className="card-head"><h2>Live check</h2><span className="small muted">Electra Index connected to the hosted endpoint {timeAgo(live.checked_at)}</span></div>
      <div className="card-body prose">
        {live.status === "online" ? (
          <p style={{ marginTop: 0 }}><span className="badge live-ok"><span className="dot live" />ONLINE</span>{" "}
            {name} answered an MCP connection on {shortDate(live.checked_at)}
            {live.server_name ? <> and introduced itself as <code>{live.server_name}{live.server_version ? ` ${live.server_version}` : ""}</code></> : null}
            {live.protocol_version ? <> (MCP protocol <span className="mono">{live.protocol_version}</span>)</> : null}.</p>
        ) : live.status === "auth_required" ? (
          <p style={{ marginTop: 0 }}><span className="badge trust">REACHABLE</span> The endpoint answered but asks for an API key or a sign-in before connecting. Electra Index never sends credentials, so the tool list is not visible here.</p>
        ) : live.status === "down" ? (
          <p style={{ marginTop: 0 }}><span className="badge attn">NOT RESPONDING</span> Our last checks in a row failed ({FAIL[live.last_result] ?? live.last_result}).{" "}
            {live.last_online_at ? <>It last answered on {shortDate(live.last_online_at)}.</> : <>It has not answered since we started checking.</>}</p>
        ) : (
          <p style={{ marginTop: 0 }} className="muted">The last check did not succeed ({FAIL[live.last_result] ?? live.last_result}). We check again before reporting a problem.</p>
        )}

        {tools.length ? (
          <>
            <p className="strong">{live.tools_more ? `${live.tool_count}+ tools` : live.tool_count === 1 ? "1 tool" : `${live.tool_count} tools`} offered to AI assistants</p>
            <ul className="tool-list">
              {first.map((t) => <li key={t.name}><code>{t.name}</code>{t.description ? <span className="small muted"> · {t.description}</span> : null}</li>)}
            </ul>
            {rest.length ? (
              <details className="tool-more"><summary className="small strong">Show {rest.length} more</summary>
                <ul className="tool-list">{rest.map((t) => <li key={t.name}><code>{t.name}</code>{t.description ? <span className="small muted"> · {t.description}</span> : null}</li>)}</ul>
              </details>
            ) : null}
            {(live.tool_count ?? 0) > tools.length ? <p className="small muted">The first {tools.length} are shown.</p> : null}
          </>
        ) : live.status === "online" ? <p className="small muted">The server did not list its tools to an anonymous client.</p> : null}

        <p className="small muted" style={{ marginBottom: 0 }}>How we test: we open an MCP session and ask for the tool list, as an AI assistant would. We never run a tool and never send a key. Checked every few days. <a href="/sources#live-check">Method</a></p>
      </div>
    </div>
  );
}
