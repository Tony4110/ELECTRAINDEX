"use client";
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

const URL_ = (process.env.NEXT_PUBLIC_ADCONTEXT_URL ?? "").replace(/\/+$/, "");
const KEY = process.env.NEXT_PUBLIC_ADCONTEXT_KEY ?? "";

function isHttps(u: string | null | undefined): u is string {
  if (!u) return false;
  try { return new URL(u).protocol === "https:"; } catch { return false; }
}

function rpc(name: string, body: unknown, keepalive = false, signal?: AbortSignal) {
  return fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: "POST",
    keepalive,
    signal,
    headers: {
      "content-type": "application/json",
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify(body),
  });
}

export default function SponsorSlot({ site, slot, variant }: { site: string; slot: string; variant?: "halfpage" }) {
  const [ad, setAd] = useState<Ad | null>(null);
  const asked = useRef(false);
  const half = variant === "halfpage";

  useEffect(() => {
    if (asked.current || !URL_ || !KEY) return;
    asked.current = true;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    rpc("ad_serve", { p_site: site, p_slot: slot }, false, ctl.signal)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Ad | null) => {
        if (data && data.creative_id && data.headline && isHttps(data.click_url)) setAd(data);
      })
      .catch(() => {})
      .finally(() => clearTimeout(t));
    return () => { clearTimeout(t); ctl.abort(); };
  }, [site, slot]);

  if (!ad) return null;

  const imageUrl = ad.image_url;
  const image = isHttps(imageUrl);

  return (
    <aside aria-label="Sponsored" className={half ? "sponsor-slot sponsor-slot-halfpage" : "sponsor-slot"}>
      <a
        href={ad.click_url}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={() => {
          rpc("ad_click", { p_creative: ad.creative_id }, true).catch(() => {});
        }}
      >
        <span className="sponsor-slot-label">Sponsored</span>
        {image && (
          <img
            src={imageUrl}
            alt={ad.advertiser ?? ""}
            width={ad.width ?? undefined}
            height={ad.height ?? undefined}
            loading="lazy"
          />
        )}
        {!(half && image) && <strong>{ad.headline}</strong>}
        {!(half && image) && ad.body && <span className="sponsor-slot-body">{ad.body}</span>}
        {half && !image && <span className="sponsor-slot-cta">Learn more</span>}
      </a>
    </aside>
  );
}
