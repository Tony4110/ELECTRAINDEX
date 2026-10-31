"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { dict, langOfPath, stripLang, lhref, PUBLIC_LANGS, isLocalized, type Lang } from "@/lib/i18n";

/** Header and footer follow the language of the page (/fr/... -> French). Pages not yet translated stay in English. */
function useLang(): { lang: Lang; base: string } {
  const path = usePathname() || "/";
  const lang = langOfPath(path);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return { lang, base: stripLang(path) };
}

function LangSwitch({ lang, base }: { lang: Lang; base: string }) {
  return (
    <div className="lang-switch" aria-label="Language">
      {PUBLIC_LANGS.map((l) => (
        <Link key={l} href={isLocalized(l, base) ? lhref(l, base) : lhref(l, "/")} className={l === lang ? "on" : ""} hrefLang={l} lang={l}>{l.toUpperCase()}</Link>
      ))}
    </div>
  );
}

export function SiteHeader() {
  const { lang, base } = useLang();
  const t = dict(lang).nav;
  return (
    <header className="header">
      <div className="wrap">
        <Link href={lhref(lang, "/")} className="logo" aria-label="Electra Index — home">
          ELECTRA<span className="sub">INDEX</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {([
            [lhref(lang, "/"), t.agents, "◆", "#1F3FD1", "", base === "/"],
            ["/new", t.new, "▲", "#E0457B", "", base.startsWith("/new")],
            [lhref(lang, "/tasks"), t.tasks, "✓", "#16A34A", "", base.startsWith("/tasks")],
            ["/mcp", t.tools, "⬡", "#F28C28", "", base.startsWith("/mcp")],
            ["/apps", t.apps, "✦", "#7C4DFF", "", base.startsWith("/apps")],
            ["/compare", t.compare, "⇄", "#0891B2", "nav-opt2", base.startsWith("/compare")],
            ["/payments", t.payments, "◎", "#0F766E", "nav-opt", base.startsWith("/payments")],
            ["/pulse", t.pulse, "∿", "#E0457B", "nav-opt2", base.startsWith("/pulse")],
            [lhref(lang, "/pricing"), t.pricing, "$", "#B7791F", "", base.startsWith("/pricing")],
            ["/blog", t.blog, "✎", "#4F46E5", "nav-opt", base.startsWith("/blog")],
            ["/sources", t.methodology, "§", "#56615C", "nav-opt3", base.startsWith("/sources")],
          ] as const).map(([href, label, icon, color, cls, on]) => (
            <Link key={href} href={href} className={`nav-i ${cls} ${on ? "on" : ""}`} style={{ ["--c" as string]: color }} aria-current={on ? "page" : undefined}>
              <span className="nav-ic" aria-hidden="true">{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <LangSwitch lang={lang} base={base} />
        <Link href={lhref(lang, "/submit")} className="btn dark">{t.list}</Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { lang } = useLang();
  const t = dict(lang).footer;
  return (
    <footer className="site">
      <div className="wrap">
        <span><b style={{ color: "var(--ink)" }}>Electra Index</b> · {t.tagline}</span>
        <span>{t.sourced}</span>
        <span className="spacer" />
        <span>{t.scores}</span>
        <Link href="/advertise" style={{ color: "var(--muted)" }}>{t.advertise}</Link>
      </div>
      <div className="wrap small" style={{ paddingTop: 8 }}>
        <span>{t.publishedBy} <a href="https://dreamotion.io" rel="noopener">Dreamotion OÜ</a> {t.estonia} · {t.contact}: <a href="mailto:contact@electraindex.com">contact@electraindex.com</a> · <a href="/privacy">{t.privacy}</a> · <a href="/mcp-server">{t.mcpServer}</a> · <a href={lhref(lang, "/pricing")}>{t.pricing}</a> · <a href="/blog">Blog</a> · <a href="/payments">{dict(lang).nav.payments}</a> · <a href="/sources">{dict(lang).nav.methodology}</a></span>
      </div>
    </footer>
  );
}
