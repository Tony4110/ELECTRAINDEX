import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Confirm Electra Verified", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type SP = Promise<{ t?: string; done?: string; name?: string; slug?: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function confirm(form: FormData) {
  "use server";
  const t = String(form.get("t") ?? "");
  const c = db();
  if (!c || !UUID.test(t)) redirect("/verified/confirm?done=0");
  const { data } = await c.rpc("verified_confirm", { p_token: t });
  const d = data as { name?: string; slug?: string } | null;
  redirect(d?.name ? `/verified/confirm?done=1&name=${encodeURIComponent(d.name)}&slug=${encodeURIComponent(d.slug ?? "")}` : "/verified/confirm?done=0");
}

/** A button, not a plain link: mail scanners open links, they do not press buttons. */
export default async function ConfirmVerified({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (sp.done !== undefined) return (
    <div style={{ maxWidth: 640 }}>
      <h1>{sp.done === "1" ? "Confirmed, we are looking for the badge" : "This link is not valid"}</h1>
      <p className="lede">{sp.done === "1"
        ? `Our robot is reading your page now. When it finds the badge of ${sp.name ?? "your server"}, Verified starts and we email you, usually within 15 minutes.`
        : "It was already used, it expired after 3 days, or the server is already Verified. You can ask again from the Electra Verified page."}</p>
      <div className="chips" style={{ marginTop: 16 }}>
        {sp.done === "1" && sp.slug ? <Link href={`/mcp/${sp.slug}`} className="btn primary">Your server&apos;s page</Link> : <Link href="/verified" className="btn primary">Electra Verified</Link>}
        <Link href="/" className="btn">Back to Electra Index</Link>
      </div>
    </div>
  );
  const t = sp.t ?? "";
  return (
    <div style={{ maxWidth: 640 }}>
      <div className="eyebrow">One click</div>
      <h1>Confirm Electra Verified</h1>
      <p className="lede">Press the button to confirm your email. We then look for the badge on the page you gave us.</p>
      <form action={confirm} style={{ marginTop: 18 }}>
        <input type="hidden" name="t" value={t} />
        <button type="submit" className="btn primary" disabled={!UUID.test(t)}>✓ Confirm</button>
      </form>
    </div>
  );
}
