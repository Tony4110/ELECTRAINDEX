import { db } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One-click unsubscribe (RFC 8058): Gmail / Outlook send a POST to the List-Unsubscribe URL. */
export async function POST(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const c = db();
  if (c && UUID.test(t)) await c.rpc("unsubscribe_follow", { p_token: t, p_all: true });
  return new Response("Unsubscribed", { status: 200, headers: { "content-type": "text/plain" } });
}

/** A plain visit (GET) never unsubscribes by itself: it shows the page with the buttons. */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  return Response.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(t)}`, req.url), 303);
}
