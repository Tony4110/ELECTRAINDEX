import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "@/lib/mcp/tools";
import { x402Config } from "@/lib/mcp/x402";

const PACK_URL = process.env.NEXT_PUBLIC_STRIPE_PACK_URL ?? "";

export const metadata: Metadata = {
  title: "Electra Index MCP server — find MCP servers and AI agents from your assistant",
  description: "Connect Claude, Cursor or any MCP client to Electra Index: search 40,000 MCP servers, check which ones are online, compare AI agents and verified prices. Free, read-only.",
  alternates: { canonical: "/mcp-server" },
};

const URL = "https://electraindex.com/api/mcp";

export default function McpServerPage() {
  const paidOn = !!(process.env.MCP_API_SECRET ?? "");
  const x402On = !!x402Config();
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

      <div className="card" style={{ marginTop: 24 }} id="setup">
        <div className="card-head"><h2>Setup with a developer key</h2><span className="small muted">For the paid tools · replace ei_your_key with your key</span></div>
        <div className="card-body prose">
          <p style={{ marginTop: 0 }}>Your key arrives by email after <Link href="/pricing#developer-pack">buying a developer pack</Link>. It starts with <code>ei_</code>. Send it as the header <code>Authorization: Bearer ei_your_key</code>:</p>
          <p className="strong">Claude Code (Terminal)</p>
          <pre className="code">{`claude mcp add --transport http electra-index ${URL} --header "Authorization: Bearer ei_your_key"`}</pre>
          <p className="strong">Cursor · file ~/.cursor/mcp.json</p>
          <pre className="code">{JSON.stringify({ mcpServers: { "electra-index": { url: URL, headers: { Authorization: "Bearer ei_your_key" } } } }, null, 2)}</pre>
          <p className="strong">VS Code · file .vscode/mcp.json</p>
          <pre className="code">{JSON.stringify({ servers: { "electra-index": { type: "http", url: URL, headers: { Authorization: "Bearer ei_your_key" } } } }, null, 2)}</pre>
          <p className="strong">Any other client or your own agent</p>
          <p>Use the endpoint <code>{URL}</code> and add the HTTP header <code>Authorization: Bearer ei_your_key</code>. Apps that only accept a URL (no header) can still use all free tools.</p>
          <p className="small muted" style={{ marginBottom: 0 }}>Each paid call uses one credit; the response header <code>x-credits-remaining</code> shows what is left. Lost key? Write to contact@electraindex.com.</p>
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

      <div className="card" style={{ marginTop: 24 }} id="pricing">
        <div className="card-head"><h2>Pricing</h2><span className="small muted">Search and facts are free</span></div>
        <div className="card-body prose">
          <p style={{ marginTop: 0 }}>Five tools are free, with no account and no key (fair use: 60 calls per minute, 2,000 per day). The availability history is paid, two ways:</p>
          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <div className="card"><div className="card-body">
              <p className="strong" style={{ marginTop: 0 }}>Pay per call · $0.01</p>
              <p className="small">For autonomous agents, no account. The server answers <code>402 Payment Required</code> with the price; your agent pays in USDC on Base with <a href="https://docs.base.org/ai-agents/guides/x402-payments" rel="noopener">x402</a> and retries.</p>
              <p className="small muted" style={{ marginBottom: 0 }}>{x402On ? "Available now." : "Coming soon."}</p>
            </div></div>
            <div className="card"><div className="card-body">
              <p className="strong" style={{ marginTop: 0 }}>Developer pack · $5.99</p>
              <p className="small">600 calls, valid 6 months. Paid by card, the key arrives by email. Then follow the <a href="#setup">setup</a> for your tool.</p>
              {paidOn && PACK_URL ? <a href={PACK_URL} className="btn primary" rel="noopener">Buy a developer pack</a> : <p className="small muted" style={{ marginBottom: 0 }}>Coming soon.</p>}
            </div></div>
          </div>
          <pre className="code" style={{ marginTop: 12 }}>claude mcp add --transport http electra-index {URL} --header &quot;Authorization: Bearer ei_your_key&quot;</pre>
          <p className="small muted" style={{ marginBottom: 0 }}>Neutrality: we sell access to data, never positions. Rankings returned by the server are the same as on the website and are never paid. We never hold your funds or keys. <Link href="/sources#what-we-sell">What we sell</Link></p>
        </div>
      </div>
    </div>
  );
}
