import { db } from "@/lib/db";

/** Confirmed followers of one product (shown next to it, never used in a score or a ranking). */
export async function getFollowers(type: "agent" | "mcp_server" | "app", slug: string): Promise<number> {
  const c = db();
  if (!c) return 0;
  const { data, error } = await c.from("v_follow_counts").select("followers").eq("type", type).eq("slug", slug).maybeSingle();
  if (error || !data) return 0;
  return Number((data as { followers: number }).followers) || 0;
}
