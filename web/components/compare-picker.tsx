"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const pairSlug = (a: string, b: string) => [a, b].sort().join("-vs-");

/** Pick any two agents and open their head-to-head page. */
export function ComparePicker({ agents }: { agents: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const ok = a && b && a !== b;
  return (
    <form className="cp-picker" onSubmit={(e) => { e.preventDefault(); if (ok) router.push(`/compare/${pairSlug(a, b)}`); }}>
      <label className="sr-only" htmlFor="cp-a">First agent</label>
      <select id="cp-a" value={a} onChange={(e) => setA(e.target.value)}>
        <option value="">Choose an agent…</option>
        {agents.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
      </select>
      <span className="cp-vs">vs</span>
      <label className="sr-only" htmlFor="cp-b">Second agent</label>
      <select id="cp-b" value={b} onChange={(e) => setB(e.target.value)}>
        <option value="">Choose another…</option>
        {agents.filter((x) => x.slug !== a).map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
      </select>
      <button type="submit" className="btn primary" disabled={!ok}>Compare →</button>
    </form>
  );
}
