import Link from "next/link";

export type ExploreLink = { href: string; label: string };
export type ExploreRow = { title: string; links: ExploreLink[]; more?: ExploreLink };

/**
 * Compact "keep exploring" block placed right under the page header, so a visitor sees
 * where to go next without scrolling past setup details. Rows with no links are skipped.
 */
export function ExploreStrip({ rows }: { rows: ExploreRow[] }) {
  const shown = rows.filter((r) => r.links.length > 0);
  if (shown.length === 0) return null;
  return (
    <nav className="explore" aria-label="Keep exploring">
      {shown.map((r) => (
        <div className="explore-row" key={r.title}>
          <span className="explore-title">{r.title}</span>
          <div className="chips" style={{ marginTop: 0 }}>
            {r.links.map((l) => <Link key={l.href} href={l.href} className="chip">{l.label}</Link>)}
            {r.more ? <Link href={r.more.href} className="chip acc">{r.more.label}</Link> : null}
          </div>
        </div>
      ))}
    </nav>
  );
}
