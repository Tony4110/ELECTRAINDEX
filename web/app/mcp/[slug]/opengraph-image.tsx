import { ImageResponse } from "next/og";
import { db } from "@/lib/db";

export const alt = "Listed on Electra Index";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = db();
  const [m, l] = c ? await Promise.all([
    c.from("v_mcp_servers").select("name,short_description,remote").eq("slug", slug).maybeSingle(),
    c.from("v_mcp_live").select("status,tool_count").eq("slug", slug).maybeSingle().then((r) => (r.error ? { data: null } : r)),
  ]) : [{ data: null }, { data: null }];
  const s = m.data as { name: string; short_description: string | null; remote: boolean | null } | null;
  const live = l.data as { status: string; tool_count: number | null } | null;
  const name = s?.name ?? "MCP server";
  const desc = (s?.short_description ?? "").slice(0, 150) + ((s?.short_description ?? "").length > 150 ? "…" : "");
  const status = live?.status === "online" ? "Online · tested live" : live?.status === "auth_required" ? "Reachable · tested live" : s?.remote ? "Hosted endpoint" : "Runs locally";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F3F4F1", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>
            <span style={{ color: "#121816" }}>ELECTRA</span><span style={{ color: "#1F3FD1", marginLeft: 10 }}>INDEX</span>
          </div>
          <div style={{ display: "flex", padding: "8px 18px", borderRadius: 999, background: "#16753A", color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>LISTED · MCP SERVER</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: name.length > 22 ? 68 : 88, fontWeight: 800, color: "#121816", lineHeight: 1.04, letterSpacing: -3 }}>{name}</div>
          {desc ? <div style={{ fontSize: 30, color: "#56615C", marginTop: 20, lineHeight: 1.35 }}>{desc}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
          <div style={{ display: "flex", flexDirection: "column", padding: "16px 24px", borderRadius: 14, background: "#fff", border: "2px solid #E3E6E4" }}>
            <span style={{ fontSize: 20, color: "#56615C" }}>Status</span>
            <span style={{ fontSize: 40, fontWeight: 800, color: live?.status === "online" ? "#16753A" : "#121816" }}>{status}</span>
          </div>
          {live?.tool_count ? (
            <div style={{ display: "flex", flexDirection: "column", padding: "16px 24px", borderRadius: 14, background: "#fff", border: "2px solid #E3E6E4" }}>
              <span style={{ fontSize: 20, color: "#56615C" }}>Tools</span>
              <span style={{ fontSize: 40, fontWeight: 800, color: "#121816" }}>{live.tool_count}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: "auto", fontSize: 24, color: "#56615C", textAlign: "right" }}>
            <span>Independent index of MCP servers</span>
            <span style={{ color: "#121816", fontWeight: 700 }}>electraindex.com</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
