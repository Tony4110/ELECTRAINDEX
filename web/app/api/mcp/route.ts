/**
 * Electra Index MCP server — Streamable HTTP, stateless, JSON responses.
 * Endpoint: https://electraindex.com/api/mcp
 * Free tools for search and facts; paid tools (x402) only when X402_PAY_TO is configured.
 */
import { TOOLS } from "@/lib/mcp/tools";
import { requirements, paymentRequired, verify, settle, x402Config } from "@/lib/mcp/x402";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const ENDPOINT = "https://electraindex.com/api/mcp";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS, DELETE",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, x-payment, authorization",
  "access-control-expose-headers": "mcp-session-id, x-payment-response",
};
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS, ...extra } });
const result = (id: Rpc["id"], r: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result: r });
const error = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function visibleTools() {
  const paidOn = !!x402Config();
  return TOOLS.filter((t) => !t.paid || paidOn).map((t) => ({
    name: t.name, title: t.title, description: t.paid ? `${t.description} Price: $${t.priceUsd} per call.` : t.description,
    inputSchema: t.inputSchema, annotations: { readOnlyHint: true, openWorldHint: false },
  }));
}

async function gate(tool: string, client: string, paid: boolean) {
  const c = db();
  if (!c) return "ok";
  const { data, error } = await c.rpc("mcp_gate", { p_tool: tool, p_client: client || null, p_paid: paid });
  return error ? "ok" : String(data);   // never block on a logging failure
}

async function handle(msg: Rpc, payment: string | null, clientIp = ""): Promise<{ body: unknown; status?: number; headers?: Record<string, string>; raw?: Response } | null> {
  const id = msg.id;
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return { body: result(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "electra-index", title: "Electra Index", version: "1.0.0", websiteUrl: "https://electraindex.com" },
        instructions: "Electra Index: independent index of AI agents and MCP servers. Search servers and agents, check live status and verified prices. Every fact has a source and a date. Rankings are never paid.",
      }) };
    }
    case "ping": return { body: result(id, {}) };
    case "tools/list": return { body: result(id, { tools: visibleTools() }) };
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool || (tool.paid && !x402Config())) return { body: error(id, -32602, `Unknown tool: ${name}`) };
      if ((await gate(tool.name, clientIp, !!tool.paid && !!payment)) === "rate_limited") return { body: error(id, -32000, "Rate limit reached (60 calls per minute, 2,000 per day). Please slow down.") };
      let paid: { payload: unknown; req: Record<string, unknown> } | null = null;
      if (tool.paid) {
        const req = requirements(tool.priceUsd ?? 0.001, `${ENDPOINT}#${tool.name}`, tool.title)!;
        const v = await verify(payment, req);
        if (!v.ok) return { body: null, raw: paymentRequired(req, v.error) };
        paid = { payload: v.payload, req };
      }
      try {
        const out = await tool.run(args);
        const headers: Record<string, string> = {};
        if (paid) {
          const receipt = await settle(paid.payload, paid.req);
          if (!receipt) return { body: null, raw: paymentRequired(paid.req, "Payment settlement failed") };
          headers["x-payment-response"] = receipt;
        }
        return { body: result(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: false }), headers };
      } catch (e) {
        return { body: result(id, { content: [{ type: "text", text: e instanceof Error ? e.message : "Error" }], isError: true }) };
      }
    }
    default:
      if (msg.method?.startsWith("notifications/") || msg.id === undefined) return null;   // notifications: no reply
      return { body: error(id, -32601, `Method not found: ${msg.method}`) };
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return json(error(null, -32700, "Parse error"), 400); }
  const payment = req.headers.get("x-payment");
  const ip = (req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (Array.isArray(body)) {   // batch (older clients): no paid tools in batches
    const out = [];
    for (const m of body.slice(0, 20) as Rpc[]) { const r = await handle(m, null, ip); if (r?.body) out.push(r.body); }
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const r = await handle(body as Rpc, payment, ip);
  if (!r) return new Response(null, { status: 202, headers: CORS });
  if (r.raw) return r.raw;
  return json(r.body, r.status ?? 200, r.headers ?? {});
}

export async function GET() {
  // no server-to-client stream: this server is stateless
  return new Response("Electra Index MCP server. Connect with an MCP client at this URL (Streamable HTTP). Docs: https://electraindex.com/mcp-server", { status: 405, headers: { "content-type": "text/plain", allow: "POST", ...CORS } });
}
export async function DELETE() { return new Response(null, { status: 405, headers: CORS }); }
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
