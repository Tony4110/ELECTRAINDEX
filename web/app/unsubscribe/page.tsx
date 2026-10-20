import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };
type SP = Promise<{ t?: string; done?: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function unsubscribe(form: FormData) {
  "use server";
  const t = String(form.get("t") ?? "");
  const all = form.get("scope") === "all";
  const c = db();
  if (!c || !UUID.test(t)) redirect("/unsubscribe?done=0");
  const { data } = await c.rpc("unsubscribe_follow", { p_token: t, p_all: all });
  redirect(`/unsubscribe?done=${Number(data ?? 0)}`);
}

/** A button, not a plain link: mail scanners open links, they do not press buttons. */
export default async function UnsubscribePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (sp.done !== undefined) return (
    <div style={{ maxWidth: 640 }}>
      <h1>{Number(sp.done) > 0 ? "You are unsubscribed" : "Nothing to unsubscribe"}</h1>
      <p className="lede">{Number(sp.done) > 0 ? "You will not get these emails any more. You can follow a page again at any time." : "This link was already used or is not valid. If you still get emails, write to contact@electraindex.com."}</p>
      <div className="chips" style={{ marginTop: 16 }}><Link href="/" className="btn">Back to Electra Index</Link></div>
    </div>
  );
  const t = sp.t ?? "";
  if (!UUID.test(t)) return <div style={{ maxWidth: 640 }}><h1>Unsubscribe</h1><p className="lede">This link is not valid. Write to contact@electraindex.com and we will remove you.</p></div>;
  return (
    <div style={{ maxWidth: 640 }}>
      <h1>Unsubscribe</h1>
      <p className="lede">Stop the emails from Electra Index for this address.</p>
      <form action={unsubscribe} className="chips" style={{ marginTop: 20 }}>
        <input type="hidden" name="t" value={t} />
        <button type="submit" name="scope" value="page" className="btn">Only this page</button>
        <button type="submit" name="scope" value="all" className="btn primary">All pages and offers</button>
      </form>
    </div>
  );
}
