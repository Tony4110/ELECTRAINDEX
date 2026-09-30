import Link from "next/link";
import { providerHref } from "@/lib/db";

export function Trust({ level }: { level: string }) {
  if (level === "proven") return <span className="badge pos" title="Proven: measured over time">✓✓ PROVEN</span>;
  if (level === "verified") return <span className="badge accent" title="Verified by our robots">✓ VERIFIED</span>;
  return <span className="badge" title="Declared by the publisher, not yet verified by us">DECLARED</span>;
}

export function Coverage({ pct }: { pct: number }) {
  return (
    <span className="cov">
      <span className="cov-bar"><span style={{ width: `${pct}%` }} className={pct === 100 ? "full" : ""} /></span>
      <span className="mono small">{pct}%</span>
    </span>
  );
}

export function ProviderCell({ type, slug, name, desc }: { type: string; slug: string; name: string; desc: string | null }) {
  return (
    <td>
      <Link href={providerHref(type, slug)} className="strong ink">{name}</Link>
      <span className="mono faint small" style={{ marginLeft: 8 }}>{type === "agent" ? "AGENT" : "MCP"}</span>
      {desc ? <div className="desc">{desc}</div> : null}
    </td>
  );
}
