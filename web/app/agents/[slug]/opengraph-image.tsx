import { ImageResponse } from "next/og";
import { db } from "@/lib/db";

export const alt = "Listed on Electra Index";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

type A = { name: string; short_description: string | null; quality_score: number | null; from_usd_month: number | null; has_free: boolean | null; pricing_verified: boolean | null };

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = db();
  const { data } = c ? await c.from("v_agent_cards").select("name,short_description,quality_score,from_usd_month,has_free,pricing_verified").eq("slug", slug).maybeSingle() : { data: null };
  const a = data as A | null;
  const name = a?.name ?? "AI agent";
  const desc = (a?.short_description ?? "").slice(0, 150) + ((a?.short_description ?? "").length > 150 ? "…" : "");
  const price = a?.from_usd_month != null ? `$${Math.round(Number(a.from_usd_month))}/mo` : a?.has_free ? "Free plan" : "On quote";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F3F4F1", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>
            <span style={{ color: "#121816" }}>ELECTRA</span><span style={{ color: "#1F3FD1", marginLeft: 10 }}>INDEX</span>
          </div>
          <div style={{ display: "flex", padding: "8px 18px", borderRadius: 999, background: "#16753A", color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>LISTED · AI AGENT</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: name.length > 22 ? 72 : 92, fontWeight: 800, color: "#121816", lineHeight: 1.02, letterSpacing: -3 }}>{name}</div>
          {desc ? <div style={{ fontSize: 30, color: "#56615C", marginTop: 20, lineHeight: 1.35 }}>{desc}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
          {a?.quality_score != null && a.quality_score >= 50 ? (
            <div style={{ display: "flex", flexDirection: "column", padding: "16px 24px", borderRadius: 14, background: "#fff", border: "2px solid #E3E6E4" }}>
              <span style={{ fontSize: 20, color: "#56615C" }}>Agent Score</span>
              <span style={{ fontSize: 46, fontWeight: 800, color: "#121816" }}>{Math.round(a.quality_score)}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", padding: "16px 24px", borderRadius: 14, background: "#fff", border: "2px solid #E3E6E4" }}>
            <span style={{ fontSize: 20, color: "#56615C" }}>From</span>
            <span style={{ fontSize: 46, fontWeight: 800, color: "#121816" }}>{price}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: "auto", fontSize: 24, color: "#56615C", textAlign: "right" }}>
            <span>{a?.pricing_verified ? "Prices verified on the official page" : "Independent index of AI agents"}</span>
            <span style={{ color: "#121816", fontWeight: 700 }}>electraindex.com</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
