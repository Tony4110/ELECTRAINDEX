import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "@/lib/mcp/tools";
import { x402Config } from "@/lib/mcp/x402";

export const metadata: Metadata = {
  title: "Electra Index MCP server — find MCP servers and AI agents from your assistant",
  description: "Connect Claude, Cursor or any MCP client to Electra Index: search 40,000 MCP servers, check which ones are online, compare AI agents and verified prices. Free, read-only.",
  alternates: { canonical: "/mcp-server" },
};

const URL = "https://electraindex.com/api/mcp";

export default function McpServerPage() {
  const paidOn = !!x402Config();
  const tools = TOOLS.filter((t) => !t.paid || paidOn);
  const cfg = JSON.stringify({ mcpServers: { "electra-index": { url: URL } } }, null, 2);
  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eyebrow">For developers and AI agents</div>
      <h1>Electra Index MCP server</h1>
      <p className="lede">Ask your AI assistant to find the right MCP server or AI agent, check if a server is online, and compare verified prices, straight from the Electra Index database. Read-only, no account, no key.</p>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Connect</h2><span className="small muted">Streamable HTTP</span></div>
        <div className="card-body prose">
          <p style={{ marginTop: 0 }}><b>Endpoint</b>: <code>{URL}</code></p>
          <p className="strong">Claude Code</p>
          <pre className="code">claude mcp add --transport http electra-index {URL}</pre>
          <p className="strong">Claude Desktop, Cursor and other MCP clients</p>
          <pre className="code">{cfg}</pre>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Tools</h2><span className="small muted">{tools.length} tools · all read-only</span></div>
        <div className="table-wrap"><table><tbody>
          {tools.map((t) => (
            <tr key={t.name}>
              <td style={{ verticalAlign: "top", width: "34%" }}><code>{t.name}</code>{t.paid ? <div><span className="badge new">PAID · ${t.priceUsd} / CALL</span></div> : <div><span className="badge trust">FREE</span></div>}</td>
              <td className="small">{t.description}</td>
            </tr>
          ))}
        </tbody></table></div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Try it</h2></div>
        <div className="card-body prose">
          <ul>
            <li>&quot;Find a hosted MCP server for web scraping that is online.&quot;</li>
            <li>&quot;What are the best MCP servers for invoicing?&quot;</li>
            <li>&quot;Compare the prices of AI agents for customer support.&quot;</li>
            <li>&quot;Does the Kinocut MCP server need an API key?&quot;</li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Payments for agents (x402)</h2></div>
        <div className="card-body prose">
          <p style={{ marginTop: 0 }}>Search and facts are free. {paidOn ? "Some data-rich tools are paid per call with" : "Data-rich tools will be paid per call with"} <a href="https://docs.base.org/ai-agents/guides/x402-payments" rel="noopener">x402</a>: the server answers <code>402 Payment Required</code> with the price, your agent pays in USDC on Base and retries. No account, no subscription. Payments go directly to Electra Index&apos;s wallet; we never hold your funds or keys.</p>
          <p className="small muted" style={{ marginBottom: 0 }}>Neutrality: we sell access to data, never positions. Rankings returned by the server are the same as on the website and are never paid. <Link href="/sources">Methodology</Link></p>
        </div>
      </div>
    </div>
  );
}
