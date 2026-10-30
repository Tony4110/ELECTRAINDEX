import Link from "next/link";
import { redirect } from "next/navigation";
import { db, getThemes } from "@/lib/db";
import { SetupNotice } from "@/components/ui";
import { dict, isLang, lhref, themeName, type Lang } from "@/lib/i18n";

export type SubmitSP = Promise<{ ok?: string; error?: string }>;

async function submit(form: FormData) {
  "use server";
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const lang: Lang = isLang(s("lang")) ? (s("lang") as Lang) : "en";
  const back = lhref(lang, "/submit");
  if (s("company_site")) redirect(`${back}?ok=1`); // honeypot: bots fill it, people never see it
  const url = (v: string) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v);
  const row = {
    kind: s("kind") === "tool" ? "tool" : s("kind") === "app" ? "app" : "agent",
    name: s("name"), website: url(s("website")), pricing_url: url(s("pricing_url")) || null,
    theme: s("theme") || null, description: s("description") || null, contact_email: s("contact_email"),
    offers_opt_in: form.get("offers_opt_in") === "on",
  };
  const c = db();
  if (!c) redirect(`${back}?error=setup`);
  const { error } = await c.from("submissions").insert(row);
  redirect(error ? `${back}?error=invalid` : `${back}?ok=1`);
}

export async function SubmitView({ searchParams, lang = "en" }: { searchParams: SubmitSP; lang?: Lang }) {
  if (!db()) return <SetupNotice />;
  const t = dict(lang).submit;
  const sp = await searchParams;
  const themes = await getThemes();

  if (sp.ok) return (
    <>
      <div className="eyebrow">{t.eyebrow}</div>
      <h1>{t.okH1}</h1>
      <p className="lede">{t.okLede}</p>
      <div className="chips" style={{ marginTop: 20 }}><Link href="/new" className="btn primary">{t.okNew}</Link><Link href={lhref(lang, "/")} className="btn">{t.okBack}</Link></div>
    </>
  );

  return (
    <>
      <div className="eyebrow">{t.eyebrow}</div>
      <h1>{t.h1}</h1>
      <p className="lede">{t.lede}</p>
      <p className="small muted" style={{ maxWidth: 860 }}>{t.mcpNote1} <a href="https://registry.modelcontextprotocol.io" rel="noopener">{t.mcpNote2}</a>{t.mcpNote3}</p>
      {sp.error ? <p className="form-error" role="alert">{sp.error === "setup" ? t.errSetup : t.errInvalid}</p> : null}
      <form action={submit} className="form card">
        <input type="hidden" name="lang" value={lang} />
        <div className="card-body form-grid">
          <label>{t.what}
            <select name="kind" defaultValue="agent"><option value="agent">{t.kindAgent}</option><option value="tool">{t.kindTool}</option><option value="app">{t.kindApp}</option></select>
          </label>
          <label>{t.name}<input name="name" required minLength={2} maxLength={120} placeholder={t.namePh} /></label>
          <label>{t.website}<input name="website" required maxLength={300} placeholder="https://your-agent.com" inputMode="url" /></label>
          <label>{t.pricing}<input name="pricing_url" maxLength={300} placeholder="https://your-agent.com/pricing" inputMode="url" /></label>
          <label>{t.theme}
            {/* the value stays the English theme name: that is what the database expects */}
            <select name="theme" defaultValue=""><option value="">{t.chooseTheme}</option>{themes.map((x) => <option key={x.theme_slug} value={x.theme}>{themeName(lang, x.theme_slug, x.theme)}</option>)}</select>
          </label>
          <label>{t.email}<input name="contact_email" type="email" required maxLength={200} placeholder="you@company.com" /><span className="small muted">{t.emailNote} <a href="/privacy">{t.privacy}</a></span></label>
          <label className="full">{t.desc}<textarea name="description" maxLength={600} rows={3} placeholder={t.descPh} /></label>
          <div className="full program-box">
            <p className="program-title">{t.programTitle}</p>
            <ul className="program-list">{t.benefits.map(([b, rest]) => <li key={b}><b>{b}</b>{rest}</li>)}</ul>
            <label className="check-line strong-check"><input type="checkbox" name="offers_opt_in" /> {t.optIn}</label>
            <p className="small muted" style={{ margin: "4px 0 0" }}>{t.optional}</p>
          </div>
          <label className="hp" aria-hidden="true">Company site<input name="company_site" tabIndex={-1} autoComplete="off" /></label>
          <div className="full"><button type="submit" className="btn primary">{t.button}</button></div>
        </div>
      </form>
      <p className="note">{t.next}</p>
    </>
  );
}
