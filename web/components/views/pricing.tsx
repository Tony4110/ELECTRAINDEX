import Link from "next/link";
import type { ReactNode } from "react";
import { x402Config } from "@/lib/mcp/x402";
import { lhref, type Lang } from "@/lib/i18n";

const PACK_URL = process.env.NEXT_PUBLIC_STRIPE_PACK_URL ?? "";

export const PRICING_META = {
  en: {
    title: "Pricing — Electra Index for developers, publishers and sponsors",
    description: "Free index, alerts and MCP server. Developer pack: $5.99 for 600 calls to the paid tools. Free Publisher Program and Monitoring Pro (launch offer: $39.99 once, for life). Sponsored placements that never change a ranking.",
  },
  fr: {
    title: "Tarifs — Electra Index pour les développeurs, les éditeurs et les sponsors",
    description: "Index, alertes et serveur MCP gratuits. Pack développeur : 5,99 $ pour 600 appels aux outils payants. Publisher Program gratuit et Monitoring Pro (offre de lancement : 39,99 $ une seule fois, à vie). Des emplacements sponsorisés qui ne changent jamais un classement.",
  },
};

/** Pricing page. Prices and links are the same in every language; only the text changes. */
export function PricingView({ lang = "en" }: { lang?: Lang }) {
  const fr = lang === "fr";
  const T = (en: ReactNode, frText: ReactNode) => (fr ? frText : en);
  const L = (p: string) => lhref(lang, p);
  const packOn = !!(process.env.MCP_API_SECRET ?? "") && !!PACK_URL;
  const x402On = !!x402Config();
  const spotlightUrl = (process.env.NEXT_PUBLIC_STRIPE_SPOTLIGHT_URL ?? "") && (process.env.MCP_API_SECRET ?? "") ? process.env.NEXT_PUBLIC_STRIPE_SPOTLIGHT_URL : "";
  const lifetimeOn = !!(process.env.NEXT_PUBLIC_STRIPE_MONITOR_LIFETIME_URL ?? "") && !!(process.env.MCP_API_SECRET ?? "");
  return (
    <>
      <div className="eyebrow">{T("Pricing", "Tarifs")}</div>
      <h1>{T("Simple pricing. Rankings are never for sale.", "Des tarifs simples. Les classements ne sont jamais à vendre.")}</h1>
      <p className="lede">{T("The index is free for everyone. You only pay for extra data or extra visibility, and neither ever changes a score or a rank.",
        "L'index est gratuit pour tout le monde. Vous ne payez que pour des données en plus ou de la visibilité en plus, et ni l'un ni l'autre ne change jamais un score ou un classement.")}</p>

      <div className="grid cols-3 pricing-grid" style={{ marginTop: 28 }}>
        <div className="card price-card">
          <div className="card-body">
            <p className="price-name">{T("Free", "Gratuit")}</p>
            <p className="price-amount">{T("$0", "0 $")}</p>
            <ul className="price-list">
              <li>{T("The full index: 210 AI agents, 40,000 MCP servers, verified prices", "L'index complet : 210 agents IA, 40 000 serveurs MCP, des prix vérifiés")}</li>
              <li>{T("Alerts by email when a tool or agent changes", "Des alertes par e-mail quand un outil ou un agent change")}</li>
              <li>{T(<>The <Link href="/mcp-server">Electra Index MCP server</Link>: search, server facts, use-case rankings, agent prices</>,
                <>Le <Link href="/mcp-server">serveur MCP d&apos;Electra Index</Link> : recherche, informations sur les serveurs, classements par usage, prix des agents</>)}</li>
              <li>{T(<>Weekly <Link href="/pulse">MCP &amp; Agent Pulse</Link></>, <>Le <Link href="/pulse">MCP &amp; Agent Pulse</Link> chaque semaine</>)}</li>
            </ul>
            <div className="program-box">
              <p className="program-title">{T("Publisher Program · free", "Publisher Program · gratuit")}</p>
              <ul className="price-list" style={{ flex: "none" }}>
                <li>{T("Alert when your MCP server stops responding", "Une alerte quand votre serveur MCP ne répond plus")}</li>
                <li>{T("Monthly report of clicks from Electra Index to your site", "Un rapport mensuel des clics d'Electra Index vers votre site")}</li>
                <li>{T("Founding pilot: free live testing for the first 10 publishers", "Pilote fondateur : test en conditions réelles gratuit pour les 10 premiers éditeurs")}</li>
              </ul>
              <p className="small" style={{ margin: "6px 0 0" }}>{T(
                <>Join from your tool or agent page: tick <i>&quot;I built it&quot;</i> in the <b>Follow</b> box. Not listed yet? <Link href={L("/submit")}>List your agent</Link>.</>,
                <>Inscrivez-vous depuis la fiche de votre outil ou de votre agent : cochez <i>« J&apos;ai créé… »</i> dans le bloc <b>Suivre</b>. Pas encore listé ? <Link href={L("/submit")}>Lister votre agent</Link>.</>)}</p>
            </div>
            <Link href="/mcp-server" className="btn">{T("Connect the MCP server", "Connecter le serveur MCP")}</Link>
          </div>
        </div>

        <div className="card price-card featured" id="developer-pack">
          <div className="card-body">
            <p className="price-name">{T("Developer pack", "Pack développeur")}</p>
            <p className="price-amount">{T("$5.99", "5,99 $")} <span className="small muted">{T("one-off", "une seule fois")}</span></p>
            <ul className="price-list">
              <li>{T(<><b>600 calls</b> to the paid tools of the MCP server, valid <b>6 months</b></>, <><b>600 appels</b> aux outils payants du serveur MCP, valables <b>6 mois</b></>)}</li>
              <li>{T("Availability history of any MCP server: every live check, outages, answer rate, versions", "L'historique de disponibilité de n'importe quel serveur MCP : chaque vérification, les pannes, le taux de réponse, les versions")}</li>
              <li>{T(<>Paid by card. Your key arrives <b>by email within a minute</b></>, <>Paiement par carte. Votre clé arrive <b>par e-mail en moins d&apos;une minute</b></>)}</li>
              <li>{x402On ? T("Or pay per call ($0.01) with x402, no account", "Ou payez à l'appel (0,01 $) avec x402, sans compte") : T("Pay per call ($0.01) with x402: coming soon", "Paiement à l'appel (0,01 $) avec x402 : bientôt")}</li>
            </ul>
            {packOn ? <a href={PACK_URL} className="btn primary" rel="noopener">{T("Buy a developer pack", "Acheter un pack développeur")}</a> : <p className="small muted">{T("Coming soon.", "Bientôt disponible.")}</p>}
            <p className="small muted" style={{ marginBottom: 0 }}>{T(<>For people who <b>choose</b> MCP servers. Then follow the <Link href="/mcp-server#setup">setup</Link> for your tool.</>,
              <>Pour ceux qui <b>choisissent</b> des serveurs MCP. Suivez ensuite la <Link href="/mcp-server#setup">configuration</Link> pour votre outil.</>)}</p>
          </div>
        </div>

        <div className="card price-card" id="monitoring">
          <div className="card-body">
            <p className="price-name">Monitoring Pro</p>
            {lifetimeOn ? (
              <>
                <p style={{ margin: 0 }}><span className="offer-tag" style={{ margin: 0 }}>{T("Exclusive launch offer", "Offre de lancement exclusive")}</span></p>
                <p className="price-amount">{T("$39.99", "39,99 $")} <span className="small muted">{T("once, for life", "une seule fois, à vie")}</span></p>
                <p className="offer-instead" style={{ margin: 0 }}>{T("Instead of", "Au lieu de")} <span className="offer-strike">{T("$9.99/month", "9,99 $/mois")}</span> (<span className="offer-strike">{T("$120 a year", "120 $ par an")}</span>)</p>
              </>
            ) : <p className="price-amount">{T("$9.99", "9,99 $")} <span className="small muted">{T("per month", "par mois")}</span></p>}
            <ul className="price-list">
              <li>{T(<>Your hosted MCP server checked <b>every 30 minutes</b></>, <>Votre serveur MCP hébergé vérifié <b>toutes les 30 minutes</b></>)}</li>
              <li>{T(<>Email <b>within the hour</b> when it stops answering, and when it is back</>, <>Un e-mail <b>dans l&apos;heure</b> quand il ne répond plus, et quand il revient</>)}</li>
              <li>{T("Private 90-day report: answer rate, outages, every check", "Un rapport privé sur 90 jours : taux de réponse, pannes, chaque vérification")}</li>
              <li>{T("Status badge for your README or website, with your answer rate", "Un badge de statut pour votre README ou votre site, avec votre taux de réponse")}</li>
            </ul>
            {lifetimeOn ? <a href={process.env.NEXT_PUBLIC_STRIPE_MONITOR_LIFETIME_URL} className="btn primary" rel="noopener">{T("Get it for $39.99", "En profiter pour 39,99 $")}</a> : <Link href={`${L("/monitor")}#start`} className="btn primary">{T("Monitor my server", "Surveiller mon serveur")}</Link>}
            <p className="small muted" style={{ marginBottom: 0 }}>{T(<>For people who <b>publish</b> a hosted MCP server.</>, <>Pour ceux qui <b>publient</b> un serveur MCP hébergé.</>)}{lifetimeOn
              ? T(<> Pay by card, enter your server address at checkout. <Link href={L("/monitor")}>Details</Link></>, <> Paiement par carte, vous indiquez l&apos;adresse de votre serveur au paiement. <Link href={L("/monitor")}>Détails</Link></>)
              : T(" Cancel anytime.", " Résiliable à tout moment.")}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-body" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span>
            <span className="offer-tag" style={{ marginRight: 10 }}>{T("Launch offer", "Offre de lancement")}</span>
            <b>Launch Spotlight · {T("$14.99", "14,99 $")}</b> <span className="offer-instead">{T("instead of", "au lieu de")} <span className="offer-strike">{T("$69.99", "69,99 $")}</span></span>
            <span className="small" style={{ display: "block", marginTop: 4 }}>{T("60 days of Sponsored visibility for your agent or MCP server on the pages where people compare. No subscription. No click? The next 60 days are free.",
              "60 jours de visibilité sponsorisée pour votre agent ou votre serveur MCP, sur les pages où les gens comparent. Sans abonnement. Aucun clic ? Les 60 jours suivants sont offerts.")}</span>
          </span>
          <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {spotlightUrl ? <a href={spotlightUrl} className="btn primary" rel="noopener">{T("Get it for $14.99", "En profiter pour 14,99 $")}</a> : null}
            <Link href={L("/spotlight")} className="btn">{T("Details", "Détails")}</Link>
          </span>
        </div>
      </div>

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>{T("Questions", "Questions fréquentes")}</h2></div>
        <div className="card-body">
          {fr ? <>
            <details><summary>Où trouver ma clé développeur ?</summary><p>Dans l&apos;e-mail envoyé juste après votre achat, depuis alerts@electraindex.com (pensez à vérifier vos spams). La clé commence par <code>ei_</code> et ne s&apos;affiche qu&apos;une fois : gardez-la secrète, comme un mot de passe.</p></details>
            <details><summary>Où saisir la clé ?</summary><p>Dans votre client MCP, avec l&apos;en-tête <code>Authorization: Bearer ei_…</code>. La marche à suivre pour Claude Code, Cursor, VS Code et les autres : <Link href="/mcp-server#setup">configuration</Link>.</p></details>
            <details><summary>J&apos;ai perdu ma clé ou utilisé tous mes appels.</summary><p>Écrivez à contact@electraindex.com depuis l&apos;adresse utilisée pour l&apos;achat. Nous pouvons vous envoyer une nouvelle clé pour les appels qu&apos;il vous reste.</p></details>
            <details><summary>Quelle différence entre le pack développeur et Monitoring Pro ?</summary><p>Le pack développeur s&apos;adresse à ceux qui <b>choisissent</b> des serveurs MCP : il permet à votre assistant IA de lire l&apos;historique de disponibilité de n&apos;importe quel serveur. Monitoring Pro s&apos;adresse à ceux qui <b>publient</b> un serveur : nous vérifions le vôtre toutes les 30 minutes et vous écrivons quand il ne répond plus. <Link href={L("/monitor")}>Monitoring Pro</Link></p></details>
            <details><summary>Puis-je payer pour être mieux classé ?</summary><p>Non. Nous vendons l&apos;accès aux données, leur historique et leur surveillance, ainsi que des emplacements sponsorisés clairement signalés. Nous ne vendons jamais un score, un classement ni la suppression d&apos;une information. <Link href="/sources#what-we-sell">Ce que nous vendons</Link></p></details>
          </> : <>
            <details><summary>Where do I find my developer key?</summary><p>In the email sent right after your purchase, from alerts@electraindex.com (check your spam folder). The key starts with <code>ei_</code> and is shown only once: keep it private, like a password.</p></details>
            <details><summary>Where do I enter the key?</summary><p>In your MCP client, as the header <code>Authorization: Bearer ei_…</code>. Step-by-step for Claude Code, Cursor, VS Code and others: <Link href="/mcp-server#setup">setup</Link>.</p></details>
            <details><summary>I lost my key or used all my calls.</summary><p>Write to contact@electraindex.com from the email you used to buy. We can send a new key for the calls you have left.</p></details>
            <details><summary>What is the difference between the developer pack and Monitoring Pro?</summary><p>The developer pack is for people who <b>choose</b> MCP servers: it lets your AI assistant read the availability history of any server. Monitoring Pro is for people who <b>publish</b> a server: we check yours every 30 minutes and email you when it stops answering. <Link href="/monitor">Monitoring Pro</Link></p></details>
            <details><summary>Can I pay to rank higher?</summary><p>No. We sell access to data, its history and its monitoring, and clearly labelled sponsored placements. We never sell a score, a rank or the removal of a fact. <Link href="/sources#what-we-sell">What we sell</Link></p></details>
          </>}
        </div>
      </div>
    </>
  );
}
