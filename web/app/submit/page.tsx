import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db, getThemes } from "@/lib/db";
import { SetupNotice } from "@/components/ui";

export const metadata: Metadata = {
  title: "List your AI agent",
  description: "Submit your AI agent or tool to Electra Index. Free. A listing never changes a score.",
  alternates: { canonical: "/submit" },
};
type SP = Promise<{ ok?: string; error?: string }>;

async function submit(form: FormData) {
  "use server";
  const s = (k: string) => String(form.get(k) ?? "").trim();
  if (s("company_site")) redirect("/submit?ok=1"); // honeypot: bots fill it, people never see it
  const url = (v: string) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v);
  const row = {
    kind: s("kind") === "tool" ? "tool" : "agent",
    name: s("name"), website: url(s("website")), pricing_url: url(s("pricing_url")) || null,
    theme: s("theme") || null, description: s("description") || null, contact_email: s("contact_email"),
  };
  const c = db();
  if (!c) redirect("/submit?error=setup");
  const { error } = await c.from("submissions").insert(row);
  redirect(error ? "/submit?error=invalid" : "/submit?ok=1");
}

export default async function SubmitPage({ searchParams }: { searchParams: SP }) {
  if (!db()) return <SetupNotice />;
  const sp = await searchParams;
  const themes = await getThemes();

  if (sp.ok) return (
    <>
      <div className="eyebrow">List your agent</div>
      <h1>Thank you. We received it.</h1>
      <p className="lede">Our robots will read your website and pricing page. Once the facts are sourced, your agent appears in New listings and in its theme ranking.</p>
      <div className="chips" style={{ marginTop: 20 }}><Link href="/new" className="btn primary">See new listings →</Link><Link href="/" className="btn">Back to the ranking</Link></div>
    </>
  );

  return (
    <>
      <div className="eyebrow">List your agent</div>
      <h1>List your AI agent</h1>
      <p className="lede">Free. We read your public pages, source every fact, and list your agent with its price and score. A listing or a partnership never changes a score.</p>
      {sp.error ? <p className="form-error" role="alert">{sp.error === "setup" ? "The site is not connected yet. Please try again later." : "Please check the form: a name, a valid website (https://…) and a valid email are required."}</p> : null}
      <form action={submit} className="form card">
        <div className="card-body form-grid">
          <label>What are you listing?
            <select name="kind" defaultValue="agent"><option value="agent">AI agent (a product people use)</option><option value="tool">Tool / MCP server (used by agents)</option></select>
          </label>
          <label>Name *<input name="name" required minLength={2} maxLength={120} placeholder="e.g. Acme Sales Agent" /></label>
          <label>Website *<input name="website" required maxLength={300} placeholder="https://your-agent.com" inputMode="url" /></label>
          <label>Pricing page<input name="pricing_url" maxLength={300} placeholder="https://your-agent.com/pricing" inputMode="url" /></label>
          <label>Theme
            <select name="theme" defaultValue=""><option value="">Choose a theme</option>{themes.map((t) => <option key={t.theme_slug} value={t.theme}>{t.theme}</option>)}</select>
          </label>
          <label>Your email *<input name="contact_email" type="email" required maxLength={200} placeholder="you@company.com" /><span className="small muted">Only used to contact you about this listing. Never published.</span></label>
          <label className="full">What does it do? (one or two sentences)<textarea name="description" maxLength={600} rows={3} placeholder="e.g. Finds B2B leads, enriches them and sends personalised outreach." /></label>
          <label className="hp" aria-hidden="true">Company site<input name="company_site" tabIndex={-1} autoComplete="off" /></label>
          <div className="full"><button type="submit" className="btn primary">Submit for listing →</button></div>
        </div>
      </form>
      <p className="note">What happens next: we check that the website and pricing page are public, our robots extract the facts, and the agent is listed with a &quot;Declared&quot; trust level until verified.</p>
    </>
  );
}
