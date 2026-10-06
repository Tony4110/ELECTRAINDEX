import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getPost, allPosts } from "@/lib/posts";
import { shortDate } from "@/lib/format";
import { SITE } from "@/lib/site";

type P = Promise<{ slug: string }>;

export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: "article", title: post.title, description: post.description, publishedTime: post.date },
  };
}

export default async function Article({ params }: { params: P }) {
  const post = getPost((await params).slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: "Electra Index" },
    mainEntityOfPage: `${SITE}/blog/${post.slug}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/blog">Blog</Link><span>/</span><span className="ink">{post.title}</span></nav>
      <div className="eyebrow">{shortDate(post.date)} · {post.author}</div>
      <h1>{post.title}</h1>
      <p className="lede">{post.description}</p>
      <article className="article">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
      </article>
      <p className="lede" style={{ marginTop: 24 }}>
        Ready to compare? <Link href="/compare">Put two agents head to head</Link> · <Link href="/agents">browse the index</Link> · <Link href="/blog">more articles</Link>.
      </p>
    </>
  );
}
