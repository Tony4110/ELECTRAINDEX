/**
 * Embeddable "Listed on Electra Index" badge for an AI app (small shield): /api/badge/app/<slug>
 * Website card version: /api/badge/app/<slug>/card
 */
import { svg } from "@/lib/badge";
import { appBadge, svgHeaders } from "@/lib/badge-data";

export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const b = await appBadge((await params).slug);
  return new Response(svg("Electra Index", b.value, b.color), { headers: svgHeaders(3600) });
}
