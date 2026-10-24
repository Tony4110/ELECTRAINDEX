import { timeAgo } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { boxT } from "@/lib/i18n-agent";

const DAY = 86_400_000;
const age = (iso: string | null | undefined) => (iso ? Date.now() - new Date(iso).getTime() : null);

/** Small status signals under a page title.
 *  Navy = trust (official source checked, recently verified), yellow = new, orange = needs attention / recently changed. */
export function StatusBadges({ verifiedAt, verifiedLabel, sourceChecked, firstSeenAt, newDays = 7, changedAt, changedLabel, extra, lang = "en" }: {
  lang?: Lang; extra?: React.ReactNode; verifiedAt?: string | null; verifiedLabel?: string; sourceChecked?: boolean; firstSeenAt?: string | null; newDays?: number; changedAt?: string | null; changedLabel?: string;
}) {
  const t = boxT(lang).status;
  verifiedLabel ??= t.lastVerified; changedLabel ??= t.updated;
  const v = age(verifiedAt), f = age(firstSeenAt), c = age(changedAt);
  const out: React.ReactNode[] = [];
  if (extra) out.push(<span key="extra" style={{ display: "contents" }}>{extra}</span>);
  if (f != null && f < newDays * DAY) out.push(<span key="new" className="badge new">{t.new} · {timeAgo(firstSeenAt, lang)}</span>);
  if (c != null && c < 14 * DAY) out.push(<span key="chg" className="badge attn"><span className="dot ember" />{changedLabel} {timeAgo(changedAt, lang)}</span>);
  if (sourceChecked) out.push(<span key="src" className="badge trust">{t.official}</span>);
  if (v != null) out.push(v > 30 * DAY
    ? <span key="ver" className="badge attn">{t.recheckDue} {timeAgo(verifiedAt, lang)}</span>
    : <span key="ver" className="badge trust">{verifiedLabel} {timeAgo(verifiedAt, lang)}</span>);
  return out.length ? <div className="status-row">{out}</div> : null;
}
