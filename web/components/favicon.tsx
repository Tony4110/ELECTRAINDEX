"use client";
import { useState } from "react";

/** Favicon image that removes itself if it fails to load (the letter tile underneath stays visible). */
export function Favicon({ domain, size }: { domain: string; size: number }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" width={size} height={size} loading="lazy" onError={() => setOk(false)} />;
}
