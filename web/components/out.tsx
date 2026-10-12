/** Outbound link through /go/ so clicks to vendor sites are counted (no personal data). */
export function Out({ type, slug, to, from, className, children }: { type: "agent" | "mcp"; slug: string; to: "website" | "pricing" | "repository"; from: string; className?: string; children: React.ReactNode }) {
  const href = `/go/${type}/${slug}?${new URLSearchParams({ to, from })}`;
  return <a href={href} className={className} target="_blank" rel="nofollow noopener">{children}</a>;
}
