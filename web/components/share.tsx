"use client";
import { useState } from "react";

const SITE = "https://electraindex.com";

function shareText(kind: "agent" | "mcp", name: string, url: string) {
  return kind === "agent"
    ? `${name} is now listed on Electra Index, the independent index of AI agents with verified prices and rankings. See how we compare: ${url} #AIagents`
    : `${name} is now listed on Electra Index, the independent index of MCP servers, tested live and ranked by use case. See it here: ${url} #MCP #AIagents`;
}

/** Small row of share buttons (LinkedIn, X, copy link) under a product title. */
export function ShareRow({ kind, slug, name }: { kind: "agent" | "mcp"; slug: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${SITE}/${kind === "agent" ? "agents" : "mcp"}/${slug}`;
  const text = shareText(kind, name, url);
  return (
    <div className="share-row">
      <span className="small muted">Share:</span>
      <a className="share-btn" href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">LinkedIn</a>
      <a className="share-btn" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text.replace(` ${url}`, ""))}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener">X</a>
      <button type="button" className="share-btn" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>{copied ? "Link copied" : "Copy link"}</button>
    </div>
  );
}

/** For the publisher: announce the listing and add the badge to their site. */
export function PublisherKit({ kind, slug, name }: { kind: "agent" | "mcp"; slug: string; name: string }) {
  const [copied, setCopied] = useState("");
  const url = `${SITE}/${kind === "agent" ? "agents" : "mcp"}/${slug}`;
  const badge = `${SITE}/api/badge/${kind === "agent" ? "agent/" : ""}${slug}`;
  const html = `<a href="${url}"><img src="${badge}" alt="Listed on Electra Index"></a>`;
  const md = `[![Listed on Electra Index](${badge})](${url})`;
  const copy = (v: string, k: string) => navigator.clipboard?.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(""), 2000); });
  return (
    <div className="card publisher-kit" style={{ marginTop: 24 }} id="share">
      <div className="card-head"><h2>Are you the publisher of {name}?</h2><span className="small muted">Free · show your listing</span></div>
      <div className="card-body">
        <p className="small" style={{ marginTop: 0 }}>An independent listing builds trust with your buyers. Announce it, and add the badge to your website or README.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <a className="btn primary" href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText(kind, name, url))}`} target="_blank" rel="noopener">Announce it on LinkedIn</a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/badge/${kind === "agent" ? "agent/" : ""}${slug}`} alt="Listed on Electra Index" height={20} />
        </div>
        <div className="kit-code">
          <code>{html}</code>
          <button type="button" className="share-btn" onClick={() => copy(html, "html")}>{copied === "html" ? "Copied" : "Copy HTML"}</button>
          <button type="button" className="share-btn" onClick={() => copy(md, "md")}>{copied === "md" ? "Copied" : "Copy Markdown"}</button>
        </div>
      </div>
    </div>
  );
}
