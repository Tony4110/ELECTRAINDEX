/** Website card badge for an AI app (260x72): /api/badge/app/<slug>/card */
import { card } from "@/lib/badge";
import { appBadge, svgHeaders } from "@/lib/badge-data";

export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const b = await appBadge((await params).slug);
  return new Response(card(b.line, "Verified prices · independent listing", b.color), { headers: svgHeaders(3600) });
}
