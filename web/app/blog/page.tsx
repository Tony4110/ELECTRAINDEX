import Link from "next/link";
import type { Metadata } from "next";
import { allPosts } from "@/lib/posts";
import { shortDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Blog",
  description: "Guides and analysis on the agent economy — how to choose, compare and trust AI agents. Every fact sourced and dated.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndex() {
  const posts = allPosts();
  return (
    <>
      <div className="eyebrow">Blog</div>
      <h1>The agent economy, explained</h1>
      <p className="lede">Guides and analysis on choosing, comparing and trusting AI agents — the same sourced, dated approach as the index.</p>

      <div className="card" style={{ marginTop: 20 }}>
        <ul className="signals">
          {posts.map((p) => (
            <li className="signal" key={p.slug}>
              <div className="signal-top">
                <Link href={`/blog/${p.slug}`} className="strong ink">{p.title}</Link>
                <span className="spacer" />
                <span className="mono small faint">{shortDate(p.date)}</span>
              </div>
              <div className="small">{p.description}</div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
