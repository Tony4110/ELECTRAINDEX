import Link from "next/link";
import { Price } from "@/components/rank";
import { appTheme, PLATFORM, type AppCard } from "@/lib/apps";

export function AppTable({ rows, showTheme = true }: { rows: AppCard[]; showTheme?: boolean }) {
  return (
    <table>
      <thead><tr><th>App</th><th>Publisher</th>{showTheme ? <th>Theme</th> : null}<th>Available on</th><th>From</th></tr></thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td><Link href={`/apps/${a.slug}`} className="strong ink">{a.name}</Link>{a.short_description ? <div className="desc">{a.short_description}</div> : null}</td>
            <td className="small">{a.company ?? "—"}{a.country ? <div className="faint">{a.country}</div> : null}</td>
            {showTheme ? <td className="small">{a.theme ? <Link href={`/apps/themes/${a.theme}`}>{appTheme(a.theme)?.name ?? a.theme}</Link> : "—"}</td> : null}
            <td className="small">{(a.platforms ?? []).map((p) => PLATFORM[p] ?? p).join(" · ") || "—"}</td>
            <td><Price from={a.from_usd_month} free={a.has_free} hasPricing={!!a.pricing_url} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
