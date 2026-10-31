import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Confirm your follow", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type SP = Promise<{ t?: string; done?: string; name?: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function confirm(form: FormData) {
  "use server";
  const t = String(form.get("t") ?? "");
  const c = db();
  if (!c || !UUID.test(t)) redirect("/follow/confirm?done=0");
  const { data } = await c.rpc("confirm_follow", { p_token: t });
  const name = String(data ?? "");
  redirect(name ? `/follow/confirm?done=1&name=${encodeURIComponent(name)}` : "/follow/confirm?done=0");
}

/** A button, not a plain link: mail scanners open links, they do not press buttons. */
export default async function ConfirmFollow({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (sp.done !== undefined) return (
    <div style={{ maxWidth: 640 }}>
      <h1>{sp.done === "1" ? "Thank you, your follow counts" : "This link is not valid"}</h1>
      <p className="lede">{sp.done === "1" ? `You now count as one of the people following ${sp.name ?? "this product"} on Electra Index. You will keep getting alerts when it changes.` : "It was already used, the follow was cancelled, or the link is incomplete. Alerts are not affected."}</p>
      <div className="chips" style={{ marginTop: 16 }}><Link href="/new" className="btn primary">See today&apos;s launches</Link><Link href="/" className="btn">Back to Electra Index</Link></div>
    </div>
  );
  const t = sp.t ?? "";
  return (
    <div style={{ maxWidth: 640 }}>
      <div className="eyebrow">One click</div>
      <h1>Confirm your follow</h1>
      <p className="lede">Press the button so your follow counts in the public number of followers. We never publish your email.</p>
      <form action={confirm} style={{ marginTop: 18 }}>
        <input type="hidden" name="t" value={t} />
        <button type="submit" className="btn primary" disabled={!UUID.test(t)}>▲ Confirm my follow</button>
      </form>
    </div>
  );
}
