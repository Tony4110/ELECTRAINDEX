// Electra Index — Robot: AI classification of online MCP servers (classify-mcp)
// Supabase Edge Function (Deno). Deploy with JWT verification OFF (the cron calls it without a key).
// Same model as Taygeta's classify-publishers.
//
// Each call (every 10 min via pg_cron; the database refuses a new batch less than 9 minutes after the last one):
//   1. asks SQL for the next 20 online servers with their real tools (next_mcp_to_classify)
//   2. asks Claude Haiku which of Electra's capabilities each server provides
//   3. sends the answers back to SQL (save_mcp_classifications), which keeps only known capabilities
// It never writes tables directly: all rules live in SQL.
// Secret needed: ANTHROPIC_API_KEY (Supabase > Edge Functions > Secrets). Never in code, never in chat.

const MODEL = "claude-haiku-5-5";
const BATCH = 20;

type Server = { id: string; name: string; description: string; tools: { n: string; d: string }[] | null };
type Capability = { slug: string; name: string };

function serviceKey(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (direct) return direct;
  const many = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (many) { try { const v = Object.values(JSON.parse(many))[0]; if (typeof v === "string") return v; } catch { /* ignore */ } }
  throw new Error("No service key available in the function environment");
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = serviceKey();
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: key };
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function prompt(servers: Server[], caps: Capability[]): string {
  const capList = caps.map((c) => `${c.slug} (${c.name})`).join(", ");
  const items = servers.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    tools: (s.tools ?? []).map((t) => (t.d ? `${t.n}: ${t.d}` : t.n)),
  }));
  return `You classify MCP servers for Electra Index, an independent index of the agent economy.
For each server, choose the capabilities it really provides, judging mainly from the TOOLS it exposes
(the description can be marketing). Use ONLY slugs from this list, at most 4 per server, most important first:
${capList}
If none fits, return an empty list.
confidence: "high" if the tools clearly show it, "medium" if likely, "low" if guessed.
summary: one neutral English sentence (max 25 words) saying what the server lets an AI agent do. No marketing words.

Servers (JSON):
${JSON.stringify(items)}

Answer with a JSON array only, no other text:
[{"id": "...", "capabilities": ["slug", ...], "confidence": "high|medium|low", "summary": "..."}]`;
}

async function classify(servers: Server[], caps: Capability[]): Promise<unknown[]> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set in Edge Function secrets");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt(servers, caps) }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const text: string = (data.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("no JSON array in the answer");
  const rows = JSON.parse(text.slice(start, end + 1));
  const sent = new Set(servers.map((s) => s.id));
  return Array.isArray(rows) ? rows.filter((r) => r && sent.has(r.id)) : [];
}

Deno.serve(async () => {
  try {
    const servers = (await rpc("next_mcp_to_classify", { p_limit: BATCH })) as Server[];
    if (!servers?.length) return Response.json({ ok: true, classified: 0, note: "nothing to do or too soon" });
    const caps = (await rpc("mcp_capability_list", {})) as Capability[];
    const rows = await classify(servers, caps);
    const saved = await rpc("save_mcp_classifications", { p_rows: rows, p_model: MODEL });
    return Response.json({ ok: true, sent: servers.length, saved });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
