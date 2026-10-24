"use client";
import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { boxT } from "@/lib/i18n-agent";

const SITE = "https://electraindex.com";

/** Shared links carry campaign tags (no personal data) so we can see which shares bring visitors. */
function tagged(url: string, source: string) {
  return `${url}?utm_source=${source}&utm_medium=share&utm_campaign=listing`;
}

function shareText(kind: "agent" | "mcp", name: string, url: string, lang: Lang = "en") {
  if (kind === "agent" && lang !== "en") return boxT(lang).shareAgent(name, url);
  return kind === "agent"
    ? `${name} is now listed on Electra Index, the independent index of AI agents with verified prices and rankings. See how we compare: ${url} #AIagents`
    : `${name} is now listed on Electra Index, the independent index of MCP servers, tested live and ranked by use case. See it here: ${url} #MCP #AIagents`;
}

/** Small row of share buttons (LinkedIn, X, copy link) under a product title. */
export function ShareRow({ kind, slug, name, lang = "en" }: { kind: "agent" | "mcp"; slug: string; name: string; lang?: Lang }) {
  const [copied, setCopied] = useState(false);
  const t = boxT(lang);
  const url = `${SITE}${lang === "en" ? "" : `/${lang}`}/${kind === "agent" ? "agents" : "mcp"}/${slug}`;
  const li = shareText(kind, name, tagged(url, "linkedin"), lang);
  const xUrl = tagged(url, "x");
  return (
    <div className="share-row">
      <span className="small muted">{t.share}</span>
      <a className="share-btn" href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(li)}`} target="_blank" rel="noopener">LinkedIn</a>
      <a className="share-btn" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(kind, name, "", lang).replace(/ +#/, " #").replace(/: +#/, " #"))}&url=${encodeURIComponent(xUrl)}`} target="_blank" rel="noopener">X</a>
      <button type="button" className="share-btn" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>{copied ? t.copied : t.copyLink}</button>
    </div>
  );
}

/** For the publisher: announce the listing and add the badge to their site. */
export function PublisherKit({ kind, slug, name, lang = "en" }: { kind: "agent" | "mcp"; slug: string; name: string; lang?: Lang }) {
  const [copied, setCopied] = useState("");
  const t = boxT(lang);
  const url = `${SITE}${lang === "en" ? "" : `/${lang}`}/${kind === "agent" ? "agents" : "mcp"}/${slug}`;
  const badge = `${SITE}/api/badge/${kind === "agent" ? "agent/" : ""}${slug}`;
  const bUrl = tagged(url, "badge");
  const html = `<a href="${bUrl}"><img src="${badge}" alt="Listed on Electra Index"></a>`;
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
          <img src={`/api/badge/${kind === "agent" ? "agent/" : ""}${slug}`} alt="Listed on Electra Index" height={20} />
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
