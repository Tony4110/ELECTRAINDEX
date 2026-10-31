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
          <Link href={lhref(lang, "/")}>{t.agents}</Link>
          <Link href="/new" className="nav-hot">{t.new}</Link>
          <Link href={lhref(lang, "/tasks")}>{t.tasks}</Link>
          <Link href="/mcp">{t.tools}</Link>
          <Link href="/apps">{t.apps}</Link>
          <Link href="/compare" className="nav-opt2">{t.compare}</Link>
          <Link href="/payments" className="nav-opt">{t.payments}</Link>
          <Link href="/pulse" className="nav-opt2">{t.pulse}</Link>
          <Link href={lhref(lang, "/pricing")}>{t.pricing}</Link>
          <Link href="/blog" className="nav-opt">{t.blog}</Link>
          <Link href="/sources">{t.methodology}</Link>
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
        <span>{t.publishedBy} <a href="https://dreamotion.io" rel="noopener">Dreamotion OÜ</a> {t.estonia} · {t.contact}: <a href="mailto:contact@electraindex.com">contact@electraindex.com</a> · <a href="/privacy">{t.privacy}</a> · <a href="/mcp-server">{t.mcpServer}</a> · <a href={lhref(lang, "/pricing")}>{t.pricing}</a> · <a href="/blog">Blog</a> · <a href="/payments">{dict(lang).nav.payments}</a></span>
      </div>
    </footer>
  );
}
