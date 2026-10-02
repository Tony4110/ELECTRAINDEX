import { ImageResponse } from "next/og";

export const alt = "Electra Index — Know your agent. Trust your transaction.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F3F4F1", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
          <span style={{ color: "#121816" }}>ELECTRA</span><span style={{ color: "#1F3FD1", marginLeft: 12 }}>INDEX</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, color: "#121816", lineHeight: 1.02, letterSpacing: -3 }}>Know your agent.</div>
          <div style={{ fontSize: 84, fontWeight: 800, color: "#121816", lineHeight: 1.02, letterSpacing: -3 }}>Trust your transaction.</div>
          <div style={{ fontSize: 30, color: "#56615C", marginTop: 28 }}>AI agents ranked on quality, price and trust. Sourced and dated.</div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#56615C" }}>electraindex.com · the trust layer for the agent economy</div>
      </div>
    ),
    size,
  );
}
