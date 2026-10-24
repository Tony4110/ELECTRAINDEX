import Link from "next/link";
import { db } from "@/lib/db";
import { lhref, type Lang } from "@/lib/i18n";

export type Spot = { type: "agent" | "mcp"; slug: string; name: string; description: string | null; host: string | null };

/** Launch Spotlight: up to 3 sponsored products on a use-case page. Always labelled, never inside a ranking. */
export async function SpotlightBox({ path, lang = "en", texts }: { path: string; lang?: Lang; texts?: Map<string, string> }) {
  const fr = lang === "fr";
  const c = db();
  if (!c) return null;
  const { data, error } = await c.rpc("spotlight_for_page", { p_path: path });
  const spots = (error ? [] : (data as Spot[] | null)) ?? [];
  if (!spots.length) return null;
  return (
    <aside className="spotlight-box" aria-label="Sponsored">
      <div className="spotlight-head"><span className="badge">{fr ? "SPONSORISÉ" : "SPONSORED"}</span><Link href="/spotlight" className="small faint">{fr ? "De quoi s'agit-il ?" : "What is this?"}</Link></div>
      <div className="spotlight-list">
        {spots.map((s) => (
          <div className="spotlight-item" key={`${s.type}-${s.slug}`}>
            <Link href={s.type === "agent" ? lhref(lang, `/agents/${s.slug}`) : `/mcp/${s.slug}`} className="strong ink">{s.name}</Link>
            {(() => { const d = lang === "en" ? s.description : s.type === "agent" ? texts?.get(s.slug) ?? null : null; return d ? <p className="small muted" style={{ margin: "2px 0 6px" }}>{d}</p> : null; })()}
            {s.host ? (
              <a className="small strong" href={`/go/${s.type}/${s.slug}?${new URLSearchParams({ to: "website", from: path, s: "1" })}`}
                 target="_blank" rel="sponsored nofollow noopener">{fr ? "Visiter" : "Visit"} {s.host} ↗</a>
            ) : null}
          </div>
        ))}
      </div>
      <p className="small faint" style={{ margin: "6px 0 0" }}>{fr ? "Les emplacements sponsorisés ne changent jamais un score ni un classement." : "Sponsored placements never change a score or a rank."}</p>
    </aside>
  );
}
