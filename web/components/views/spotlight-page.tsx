import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { lhref, themeName, type Lang } from "@/lib/i18n";
import { TASKS_FR } from "@/lib/i18n-paths";
import { capNameEn } from "@/lib/i18n-agent";

const BUY_URL = process.env.NEXT_PUBLIC_STRIPE_SPOTLIGHT_URL ?? "";

export const SPOTLIGHT_META = {
  en: {
    title: "Launch Spotlight — put your AI agent or MCP server in front of people choosing one",
    description: "60 days of sponsored visibility on the Electra Index pages where your agent or MCP server already appears, plus the weekly Pulse. Launch offer: USD 14.99 once, no subscription. No click in 60 days? The next 60 days are free.",
  },
  fr: {
    title: "Launch Spotlight — montrez votre agent IA ou votre serveur MCP à ceux qui en choisissent un",
    description: "60 jours de visibilité sponsorisée sur les pages d'Electra Index où votre agent ou votre serveur MCP apparaît déjà, plus le Pulse hebdomadaire. Offre de lancement : 14,99 $ une seule fois, sans abonnement. Aucun clic en 60 jours ? Les 60 jours suivants sont offerts.",
  },
};

type Preview = { found: boolean; type?: "agent" | "mcp"; slug?: string; name?: string; pages?: string[]; running?: boolean };

function label(p: string, lang: Lang) {
  const fr = lang === "fr";
  if (p === "/new") return fr ? "Nouveautés" : "New listings";
  const [, kind, a, b] = p.split("/");
  const words = (x: string) => x.replace(/-/g, " ");
  if (kind === "tasks") return fr ? `Tâche : ${TASKS_FR[a]?.[1] ?? words(a)}` : `Task: ${words(a)}`;
  if (kind === "themes") return fr ? `Thème : ${themeName("fr", a, words(a))}` : `Theme: ${words(a)}`;
  if (kind === "mcp" && a === "best") return fr ? `Meilleurs serveurs MCP : ${capNameEn("fr", words(b).replace(/\b\w/g, (m) => m.toUpperCase())).toLowerCase()}` : `Best MCP servers for ${words(b)}`;
  return p;
}

export async function SpotlightView({ searchParams, lang = "en" }: { searchParams: Promise<{ product?: string }>; lang?: Lang }) {
  const fr = lang === "fr";
  const T = (en: ReactNode, frText: ReactNode) => (fr ? frText : en);
  const L = (p: string) => lhref(lang, p);
  const q = ((await searchParams).product ?? "").trim().slice(0, 300);
  const on = !!BUY_URL && !!(process.env.MCP_API_SECRET ?? "");
  let preview: Preview | null = null;
  const c = db();
  if (q && c) {
    const { data } = await c.rpc("spotlight_preview", { p_ref: q });
    preview = (data as Preview | null) ?? { found: false };
  }
  const buy = T("Get it for $14.99 →", "En profiter pour 14,99 $ →");

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eyebrow">{T("For agent and MCP server publishers", "Pour les éditeurs d'agents et de serveurs MCP")}</div>
      <h1>Launch Spotlight</h1>
      <p className="lede">{T("Put your AI agent or MCP server in front of the people who are choosing one, on the pages where they compare.",
        "Montrez votre agent IA ou votre serveur MCP à ceux qui sont en train d'en choisir un, sur les pages où ils comparent.")}</p>

      <div className="offer-box" style={{ marginTop: 20 }}>
        <span className="offer-tag">{T("Exclusive launch offer", "Offre de lancement exclusive")}</span>
        <p className="offer-price">{T(<><b>$14.99 once</b>, 60 days of visibility</>, <><b>14,99 $ une seule fois</b>, 60 jours de visibilité</>)}</p>
        <p className="offer-was" style={{ margin: "4px 0 0" }}>{T("Instead of", "Au lieu de")} <span className="offer-strike">{T("$69.99", "69,99 $")}</span> <span className="offer-save">{T("No subscription", "Sans abonnement")}</span></p>
        <p className="small" style={{ margin: "6px 0 12px" }}>{T("Want more time? Buy another 60 days anytime, at the same launch price.", "Besoin de plus de temps ? Rachetez 60 jours quand vous voulez, au même prix de lancement.")}</p>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {on ? <a className="btn primary" href={BUY_URL} rel="noopener">{buy}</a> : <span className="small muted">{T("Opening very soon.", "Ouverture très prochainement.")}</span>}
          <span className="small">{T(<>You enter your product page or website at checkout. <a href="#preview">See where it would appear ↓</a></>,
            <>Vous indiquez la page de votre produit ou votre site au paiement. <a href="#preview">Voir où il apparaîtrait ↓</a></>)}</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-body">
          <div className="story story-good">
            <p className="price-name">{T("Our promise", "Notre promesse")}</p>
            <p style={{ margin: 0 }}>{T(<><b>No click in 60 days? The next 60 days are free.</b> We count real visitors only: robots and link previews are excluded, and each visitor counts once a day. You get the numbers after 30 days and at the end.</>,
              <><b>Aucun clic en 60 jours ? Les 60 jours suivants sont offerts.</b> Nous ne comptons que de vrais visiteurs : les robots et les aperçus de liens sont exclus, et chaque visiteur compte une fois par jour. Vous recevez les chiffres après 30 jours et à la fin.</>)}</p>
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 24 }}>
        <div className="card"><div className="card-body">
          <p className="price-name">{T("Where your product appears", "Où apparaît votre produit")}</p>
          <ul className="price-list">
            {fr ? <>
              <li>Une <b>carte Sponsorisée</b> sur les pages d&apos;usage où il est déjà classé : tâches, thèmes, « Meilleurs serveurs MCP pour… » (jusqu&apos;à 8 pages)</li>
              <li>La page <b>Nouveautés</b></li>
              <li>Le <b>MCP &amp; Agent Pulse hebdomadaire</b>, dans une section Sponsorisé à part</li>
            </> : <>
              <li>A <b>Sponsored card</b> on the use-case pages where it already ranks: agent tasks, themes, &quot;Best MCP servers for…&quot; (up to 8 pages)</li>
              <li>The <b>New listings</b> page</li>
              <li>The <b>weekly MCP &amp; Agent Pulse</b>, in a separate Sponsored section</li>
            </>}
          </ul>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="price-name">{T("The rules", "Les règles")}</p>
          <ul className="price-list">
            {fr ? <>
              <li>Toujours signalé <b>Sponsorisé</b>, jamais dans un classement, ne change jamais un score</li>
              <li>Au maximum <b>3 sponsors par page</b>, affichés côte à côte</li>
              <li>Votre produit doit être listé sur Electra Index (gratuit : <Link href={L("/submit")}>le lister</Link>)</li>
              <li>Paiement unique par carte avec Stripe : <b>rien n&apos;est prélevé ensuite</b></li>
            </> : <>
              <li>Always labelled <b>Sponsored</b>, never inside a ranking, never changes a score</li>
              <li>At most <b>3 sponsors per page</b>, shown side by side</li>
              <li>Your product must be listed on Electra Index (free: <Link href="/submit">list it</Link>)</li>
              <li>Paid once by card with Stripe: <b>nothing is charged again</b></li>
            </>}
          </ul>
        </div></div>
      </div>

      <div className="card follow-box" style={{ marginTop: 24 }} id="preview">
        <div className="card-head"><h2>{T("Where would my product appear?", "Où apparaîtrait mon produit ?")}</h2><span className="small muted">{T("Optional · free check", "Facultatif · vérification gratuite")}</span></div>
        <div className="card-body">
          <form method="get" action={`${L("/spotlight")}#preview`} className="follow-form">
            <label className="small" htmlFor="product">{T("Your agent or MCP server: its Electra Index page, its website or its name", "Votre agent ou serveur MCP : sa page Electra Index, son site ou son nom")}</label>
            <div className="follow-row">
              <input id="product" name="product" defaultValue={q} required maxLength={300} placeholder={fr ? "ex. : https://electraindex.com/agents/votre-agent" : "e.g. https://electraindex.com/agents/your-agent"} />
              <button type="submit" className="btn dark">{T("Check →", "Vérifier →")}</button>
            </div>
          </form>
          {preview ? (
            preview.found ? (
              <div style={{ marginTop: 16 }}>
                <p style={{ marginTop: 0 }}><span className="badge live-ok">{T("FOUND", "TROUVÉ")}</span> <b>{preview.name}</b>{preview.running ? T(" · already in the Spotlight (buying again adds 60 days)", " · déjà dans le Spotlight (un nouvel achat ajoute 60 jours)") : ""}</p>
                <p className="small" style={{ marginBottom: 6 }}>{T("Your Sponsored card would appear on:", "Votre carte Sponsorisée apparaîtrait sur :")}</p>
                <ul className="plain small">{(preview.pages ?? []).map((p) => <li key={p}><Link href={L(p)}>{label(p, lang)}</Link></li>)}</ul>
                {(preview.pages ?? []).length <= 1 ? <p className="small muted">{T("Your product does not rank on a use-case page yet, so it would appear on New listings and in the Pulse.", "Votre produit n'est pas encore classé sur une page d'usage : il apparaîtrait donc dans les Nouveautés et dans le Pulse.")}</p> : null}
                {on ? <a className="btn primary" href={BUY_URL} rel="noopener" style={{ marginTop: 10 }}>{buy}</a> : null}
              </div>
            ) : (
              <p className="form-error" style={{ marginTop: 16 }}>{T(<>We did not find &quot;{q}&quot; on Electra Index. Try its page link (electraindex.com/agents/… or /mcp/…), or <Link href="/submit">list it for free</Link> first.</>,
                <>Nous n&apos;avons pas trouvé « {q} » sur Electra Index. Essayez le lien de sa page (electraindex.com/agents/… ou /mcp/…), ou <Link href={L("/submit")}>listez-le gratuitement</Link> d&apos;abord.</>)}</p>
            )
          ) : null}
        </div>
      </div>

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>{T("Questions", "Questions fréquentes")}</h2></div>
        <div className="card-body">
          {fr ? <>
            <details open><summary>Est-ce un abonnement ?</summary><p>Non. Vous payez 14,99 $ une seule fois pour 60 jours. Rien n&apos;est prélevé ensuite. Si vous voulez plus de temps, vous rachetez vous-même 60 jours, au même prix de lancement.</p></details>
            <details><summary>Comment comptez-vous les clics ?</summary><p>Un clic compte quand un vrai visiteur d&apos;une page Electra Index clique vers votre site. Les robots, les aperçus de liens et les clics répétés d&apos;un même visiteur le même jour ne sont pas comptés.</p></details>
            <details><summary>Et si personne ne clique ?</summary><p>Si votre carte Sponsorisée n&apos;obtient aucun clic en 60 jours, nous la diffusons 60 jours de plus, gratuitement. Une fois par sponsor.</p></details>
            <details><summary>Est-ce que cela améliore mon classement ?</summary><p>Non. Les scores et les classements n&apos;utilisent que des données publiques et vérifiables. Les cartes sponsorisées sont affichées à part des classements. <Link href="/sources#what-we-sell">Ce que nous vendons</Link></p></details>
            <details><summary>Quand est-ce que cela commence ?</summary><p>Moins d&apos;une minute après le paiement. Vous recevez un e-mail avec les pages où votre produit apparaît et un lien vers votre rapport privé.</p></details>
          </> : <>
            <details open><summary>Is it a subscription?</summary><p>No. You pay $14.99 once for 60 days. Nothing is charged again. If you want more time, you buy another 60 days yourself, at the same launch price.</p></details>
            <details><summary>How do you count clicks?</summary><p>A click counts when a real visitor on an Electra Index page clicks through to your site. Robots, link previews and repeated clicks from the same visitor on the same day are not counted.</p></details>
            <details><summary>What if nobody clicks?</summary><p>If your Sponsored card gets no click in 60 days, we run it for another 60 days, free. Once per sponsor.</p></details>
            <details><summary>Does it improve my rank?</summary><p>No. Scores and rankings only use public, verifiable data. Sponsored cards are shown apart from rankings. <Link href="/sources#what-we-sell">What we sell</Link></p></details>
            <details><summary>When does it start?</summary><p>Within a minute of payment. You receive an email with the pages where your product appears and a link to your private report.</p></details>
          </>}
        </div>
      </div>
    </div>
  );
}
