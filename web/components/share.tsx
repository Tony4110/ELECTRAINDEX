"use client";
import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { boxT } from "@/lib/i18n-agent";

const SITE = "https://electraindex.com";

/** Shared links carry campaign tags (no personal data) so we can see which shares bring visitors. */
function tagged(url: string, source: string) {
  return `${url}?utm_source=${source}&utm_medium=share&utm_campaign=listing`;
}

function shareText(kind: "agent" | "mcp" | "app", name: string, url: string, lang: Lang = "en") {
  if (kind === "agent" && lang !== "en") return boxT(lang).shareAgent(name, url);
  if (kind === "app") return `${name} is now listed on Electra Index, with its publisher and prices checked on its official pages: ${url} #AIapps`;
  return kind === "agent"
    ? `${name} is now listed on Electra Index, the independent index of AI agents with verified prices and rankings. See how we compare: ${url} #AIagents`
    : `${name} is now listed on Electra Index, the independent index of MCP servers, tested live and ranked by use case. See it here: ${url} #MCP #AIagents`;
}

/** Small row of share buttons (LinkedIn, X, copy link) under a product title. */
export function ShareRow({ kind, slug, name, lang = "en" }: { kind: "agent" | "mcp" | "app"; slug: string; name: string; lang?: Lang }) {
  const [copied, setCopied] = useState(false);
  const t = boxT(lang);
  const url = `${SITE}${lang === "en" ? "" : `/${lang}`}/${kind === "agent" ? "agents" : kind === "app" ? "apps" : "mcp"}/${slug}`;
  const li = shareText(kind, name, tagged(url, "linkedin"), lang);
  const xUrl = tagged(url, "x");
  const ic = { width: 16, height: 16, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  return (
    <span className="share-row" role="group" aria-label={t.share}>
      <a className="share-btn icon" aria-label="Share on LinkedIn" title="LinkedIn" href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(li)}`} target="_blank" rel="noopener">
        <svg {...ic} fill="#0A66C2"><path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.22 8h4.56v14H.22V8zm7.5 0h4.37v1.92h.06c.61-1.15 2.1-2.36 4.32-2.36 4.62 0 5.47 3.04 5.47 7V22h-4.56v-6.6c0-1.57-.03-3.6-2.2-3.6-2.2 0-2.53 1.72-2.53 3.49V22H7.72V8z" /></svg>
      </a>
      <a className="share-btn icon" aria-label="Share on X" title="X" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(kind, name, "", lang).replace(/ +#/, " #").replace(/: +#/, " #"))}&url=${encodeURIComponent(xUrl)}`} target="_blank" rel="noopener">
        <svg {...ic} fill="#121816"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" /></svg>
      </a>
      <button type="button" className="share-btn icon" aria-label={copied ? t.copied : t.copyLink} title={copied ? t.copied : t.copyLink} onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>
        {copied ? <svg {...ic} fill="none" stroke="#16753A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
          : <svg {...ic} fill="none" stroke="#121816" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>}
      </button>
      <a className="share-badge" href="#share" title={t.kitTitle(name)}>
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
        {t.kitBadgeLink}
      </a>
    </span>
  );
}

/** For the publisher: announce the listing and add the badge to their site. */
export function PublisherKit({ kind, slug, name, lang = "en" }: { kind: "agent" | "mcp" | "app"; slug: string; name: string; lang?: Lang }) {
  const seg = kind === "agent" ? "agents" : kind === "app" ? "apps" : "mcp";
  const bseg = kind === "mcp" ? "" : `${kind}/`;
  const [copied, setCopied] = useState("");
  const t = boxT(lang);
  const url = `${SITE}${lang === "en" ? "" : `/${lang}`}/${seg}/${slug}`;
  const badge = `${SITE}/api/badge/${bseg}${slug}`;
  const bUrl = tagged(url, "badge");
  const html = `<a href="${bUrl}"><img src="${badge}/card" width="260" height="72" alt="Listed on Electra Index"></a>`;
  const md = `[![Listed on Electra Index](${badge})](${bUrl})`;
  const copy = (v: string, k: string) => navigator.clipboard?.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(""), 2000); });
  return (
    <div className="card publisher-kit" style={{ marginTop: 24 }} id="share">
      <div className="card-head"><h2>{t.kitTitle(name)}</h2><span className="small muted">{t.kitSub}</span></div>
      <div className="card-body">
        <p className="small" style={{ marginTop: 0 }}>{t.kitText}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <a className="btn primary" href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText(kind, name, tagged(url, "linkedin"), lang))}`} target="_blank" rel="noopener">{t.kitLinkedIn}</a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/badge/${bseg}${slug}/card`} alt="Listed on Electra Index" width={260} height={72} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/badge/${bseg}${slug}`} alt="Listed on Electra Index" height={20} />
        </div>
        <div className="kit-code">
          <code>{html}</code>
          <button type="button" className="share-btn" onClick={() => copy(html, "html")}>{copied === "html" ? t.copiedShort : t.copyHtml}</button>
          <button type="button" className="share-btn" onClick={() => copy(md, "md")}>{copied === "md" ? t.copiedShort : t.copyMd}</button>
        </div>
      </div>
    </div>
  );
}
