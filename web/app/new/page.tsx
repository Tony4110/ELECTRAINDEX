import Link from "next/link";
import type { Metadata } from "next";
import { db, getSignals, type AgentCard } from "@/lib/db";
import { SignalItem, Empty, SetupNotice } from "@/components/ui";
import { Logo } from "@/components/rank";
import SponsorSlot from "@/components/sponsor-slot";
import { SpotlightBox } from "@/components/spotlight";
import { themeStyle } from "@/lib/theme-style";
import { appTheme } from "@/lib/apps";

export const metadata: Metadata = {
  title: "Launches: new AI agents, MCP servers and AI apps",
  description: "Every AI agent, MCP server and AI app listed on Electra Index in the last 30 days, with the number of people following each one. Launch yours for free.",
  alternates: { canonical: "/new" },
};
type SP = Promise<{ tab?: string; kind?: string }>;
type Launch = { type: "agent" | "mcp_server" | "app"; slug: string; name: string; short_description: string | null; website: string | null; first_seen_at: string; theme: string | null; followers: number };

const KINDS = { all: "All", agents: "AI agents", mcp: "MCP servers", apps: "AI apps" } as const;
const TYPE_OF: Record<string, Launch["type"] | null> = { all: null, agents: "agent", mcp: "mcp_server", apps: "app" };
const LABEL: Record<Launch["type"], string> = { agent: "AI AGENT", mcp_server: "MCP SERVER", app: "AI APP" };
const href = (l: Launch) => (l.type === "agent" ? `/agents/${l.slug}` : l.type === "app" ? `/apps/${l.slug}` : `/mcp/${l.slug}`);

function bucket(iso: string) {
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  return days < 1 ? "Launched today" : days < 7 ? "This week" : "Earlier this month";
}

export default async function LaunchesPage({ searchParams }: { searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const sp = await searchParams;
  const tab = sp.tab === "changes" ? "changes" : "launches";
  const kind = (sp.kind && sp.kind in KINDS ? sp.kind : "all") as keyof typeof KINDS;

  let launches: Launch[] = [];
  if (tab === "launches") {
    let q = c.from("v_launches").select("*").order("first_seen_at", { ascending: false }).limit(400);
    if (TYPE_OF[kind]) q = q.eq("type", TYPE_OF[kind]!);
    const r = await q;
    if (!r.error) launches = (r.data as Launch[] | null) ?? [];
    else {
      // before INSTALL_LAUNCHES.sql: newest agents only
      const a = await c.from("v_agent_cards").select("*").order("first_seen_at", { ascending: false }).limit(60);
      launches = ((a.data as AgentCard[] | null) ?? []).map((x) => ({ type: "agent", slug: x.slug, name: x.name, short_description: x.short_description, website: x.website, first_seen_at: x.first_seen_at, theme: x.theme_slugs?.[0] ?? null, followers: 0 }));
    }
  }
  const groups = ["Launched today", "This week", "Earlier this month"].map((label) => ({
    label,
    rows: launches.filter((l) => bucket(l.first_seen_at) === label)
      .sort((a, b) => Number(b.followers) - Number(a.followers) || b.first_seen_at.localeCompare(a.first_seen_at)),
  })).filter((g) => g.rows.length);
  const changes = tab === "changes" ? await getSignals(100) : [];
  const qs = (o: { tab?: string; kind?: string }) => {
    const m = new URLSearchParams({ ...(o.tab && o.tab !== "launches" ? { tab: o.tab } : {}), ...(o.kind && o.kind !== "all" ? { kind: o.kind } : {}) }).toString();
    return `/new${m ? "?" + m : ""}`;
  };

  return (
    <>
      <section className="tb-hero ln-hero">
        <div className="eyebrow">Launches</div>
        <h1>New AI agents, MCP servers and apps</h1>
        <p className="lede">Everything listed on Electra Index in the last 30 days. Like one? Follow it: <b>▲</b> is the number of people who confirmed they follow it. It never changes a score or a ranking.</p>
        <div className="chips" style={{ marginTop: 14 }}><Link href="/submit" className="btn primary">Launch your product, free →</Link></div>
      </section>

      <SpotlightBox path="/new" />
      <div className="featured-launch">
        <p className="featured-launch-kicker">Featured launch</p>
        <SponsorSlot site="electra" slot="new-featured" />
      </div>

      <div className="tabs" role="tablist">
        <Link role="tab" aria-selected={tab === "launches"} href={qs({ kind })} className={tab === "launches" ? "on" : ""}>Launches</Link>
        <Link role="tab" aria-selected={tab === "changes"} href={qs({ tab: "changes" })} className={tab === "changes" ? "on" : ""}>Price &amp; version changes</Link>
      </div>

      {tab === "launches" ? (
        <>
          <div className="tb-chips" style={{ marginTop: 14 }}>
            {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => <Link key={k} href={qs({ kind: k })} className={`tb-chip ${kind === k ? "on" : ""}`}>{KINDS[k]}</Link>)}
          </div>
          {groups.length === 0 ? <div style={{ marginTop: 16 }}><Empty title="No launch yet">New products appear here as soon as they are listed.</Empty></div> : groups.map((g) => (
            <section key={g.label}>
              <h2 className="ln-day">{g.label} <span className="mono faint small">{g.rows.length}</span></h2>
              <ol className="ln-list">
                {g.rows.map((l, i) => {
                  const th = l.type === "app" ? appTheme(l.theme)?.name : null;
                  const st = themeStyle(l.type === "app" ? null : l.theme);
                  return (
                    <li key={`${l.type}-${l.slug}`} className="ln-item">
                      <Link href={href(l)} className="ln-main">
                        <Logo name={l.name} website={l.website} size={52} />
                        <span className="ln-body">
                          <span className="ln-name">{i + 1}. {l.name}</span>
                          {l.short_description ? <span className="ln-desc">{l.short_description}</span> : null}
                          <span className="ln-tags">
                            <span className={`ln-type t-${l.type}`}>{LABEL[l.type]}</span>
                            {th ? <span>{th}</span> : l.theme && l.type === "agent" ? <span style={{ color: st.color }}>{l.theme.replace(/-/g, " ")}</span> : null}
                          </span>
                        </span>
                      </Link>
                      <Link href={`${href(l)}#follow`} className="ln-vote" aria-label={`Follow ${l.name}`} title="Follow: get alerts and count as a follower">
                        <span className="ln-arrow">▲</span><span className="ln-n">{l.followers}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          {changes.length === 0 ? <div className="card-body"><Empty title="No change yet">A change is reported only when a robot has an earlier observation to compare with: price up or down, new version, new plan.</Empty></div>
            : <ul className="signals">{changes.map((s) => <SignalItem key={s.id} s={s} />)}</ul>}
        </div>
      )}
    </>
  );
}
