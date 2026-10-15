"use client";
// Sponsor slot served by the AdContext mini ad server (separate Supabase project).
// - Outside the ranking, always labelled "Sponsored", rel="sponsored".
// - Renders nothing when the env vars are missing, the server is down, or no campaign is live.
// - No cookie, no tracker: one ad_serve call per page view, one ad_click call on click.
import { useEffect, useRef, useState } from "react";

type Ad = {
  creative_id: string;
  advertiser: string | null;
  headline: string;
  body: string | null;
  image_url: string | null;
  click_url: string;
  width: number | null;
  height: number | null;
};

const BASE = (process.env.NEXT_PUBLIC_ADCONTEXT_URL ?? "").replace(/\/+$/, "");
const KEY = process.env.NEXT_PUBLIC_ADCONTEXT_KEY ?? "";

function https(u: string | null | undefined): u is string {
  if (!u) return false;
  try { return new URL(u).protocol === "https:"; } catch { return false; }
}

function rpc(name: string, body: unknown, keepalive = false) {
  return fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    keepalive,
    headers: { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
}

export function SponsorSlot({ site, slot }: { site: string; slot: string }) {
  const [ad, setAd] = useState<Ad | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || !BASE || !KEY) return;
    asked.current = true;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    fetch(`${BASE}/rest/v1/rpc/ad_serve`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ p_site: site, p_slot: slot }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Ad | null) => { if (d && d.creative_id && d.headline && https(d.click_url)) setAd(d); })
      .catch(() => {})
      .finally(() => clearTimeout(t));
  }, [site, slot]);

  if (!ad) return null;

  return (
    <aside className="sponsor-slot" aria-label="Sponsored">
      <a
        href={ad.click_url}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={() => { rpc("ad_click", { p_creative: ad.creative_id }, true).catch(() => {}); }}
      >
        {https(ad.image_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.image_url} alt={ad.advertiser ?? ""} width={ad.width ?? 300} height={ad.height ?? 250} loading="lazy" />
        ) : null}
        <span className="sponsor-text">
          <span className="sponsor-label">Sponsored{ad.advertiser ? ` · ${ad.advertiser}` : ""}</span>
          <strong>{ad.headline}</strong>
          {ad.body ? <span className="sponsor-body">{ad.body}</span> : null}
        </span>
      </a>
    </aside>
  );
}
