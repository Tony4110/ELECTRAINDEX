import Link from "next/link";
import { EVENT_LABEL, eventTone, describeSignal, timeAgo } from "@/lib/format";
import type { Signal } from "@/lib/db";

/** Tri-state pill: true = documented, false = confirmed absent, null = not documented */
export function Tri({ label, value }: { label: string; value: boolean | null | undefined }) {
  const cls = value === true ? "pill on" : value === false ? "pill off" : "pill unk";
  const title = value === true ? `${label}: yes` : value === false ? `${label}: no` : `${label}: not documented`;
  return <span className={cls} title={title}>{label}</span>;
}

export function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function SignalItem({ s }: { s: Signal }) {
  const href = s.entity_type === "mcp_server" ? `/mcp/${s.entity_slug}` : `/agents/${s.entity_slug}`;
  return (
    <li className="signal">
      <div className="signal-top">
        <Badge tone={eventTone(s.event_type)}>{EVENT_LABEL[s.event_type] ?? s.event_type.toUpperCase()}</Badge>
        <span className="mono muted small">{timeAgo(s.detected_at)}</span>
      </div>
      <div><Link href={href} className="strong ink">{s.entity_name}</Link> <span className="muted">{describeSignal(s)}</span></div>
    </li>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="strong">{title}</div>
      {children ? <div className="muted">{children}</div> : null}
    </div>
  );
}

export function SetupNotice() {
  return (
    <div className="empty">
      <div className="strong">Database not connected</div>
      <div className="muted">Create <span className="mono">web/.env.local</span> with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example), then restart <span className="mono">npm run dev</span>.</div>
    </div>
  );
}
