import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { lhref, type Lang } from "@/lib/i18n";

const MONITOR_URL = process.env.NEXT_PUBLIC_STRIPE_MONITOR_URL ?? "";
const LIFETIME_URL = process.env.NEXT_PUBLIC_STRIPE_MONITOR_LIFETIME_URL ?? "";   // launch offer, paid once

export const MONITOR_META = {
  en: {
    title: "Monitoring Pro — know within the hour when your MCP server stops answering",
    description: "For publishers of hosted MCP servers: a check every 30 minutes, an email when it stops answering and when it is back, a private 90-day report and a status badge. Launch offer: USD 39.99 once, for life, instead of USD 9.99/month.",
  },
  fr: {
    title: "Monitoring Pro — sachez dans l'heure quand votre serveur MCP ne répond plus",
    description: "Pour les éditeurs de serveurs MCP hébergés : une vérification toutes les 30 minutes, un e-mail quand il ne répond plus et quand il revient, un rapport privé sur 90 jours et un badge de statut. Offre de lancement : 39,99 $ une seule fois, à vie, au lieu de 9,99 $/mois.",
  },
};

type Check = { found: boolean; slug?: string; name?: string; url?: string | null; hosted?: boolean; active?: boolean };

function checkoutLink(slug: string, base = MONITOR_URL) {
  const u = new URL(base);
  u.searchParams.set("client_reference_id", slug);
  return u.toString();
}

export async function MonitorView({ searchParams, lang = "en" }: { searchParams: Promise<{ server?: string }>; lang?: Lang }) {
  const fr = lang === "fr";
  const T = (en: ReactNode, frText: ReactNode) => (fr ? frText : en);
  const self = lhref(lang, "/monitor");
  const q = ((await searchParams).server ?? "").trim().slice(0, 300);
  const secretOn = !!(process.env.MCP_API_SECRET ?? "");
  const on = !!MONITOR_URL && secretOn;
  const offer = !!LIFETIME_URL && secretOn;
  const c = db();
  let check: Check | null = null;
  let suggestions: { slug: string; name: string }[] = [];
  if (q && c) {
    const { data } = await c.rpc("monitor_check_server", { p_ref: q });
    check = (data as Check | null) ?? { found: false };
    if (!check.found && q.length >= 3 && !/^https?:\/\//i.test(q)) {
      const { data: s } = await c.from("v_mcp_servers").select("slug,name").ilike("name", `%${q.replace(/[%_,()]/g, " ")}%`).eq("remote", true).limit(6);
      suggestions = (s as { slug: string; name: string }[] | null) ?? [];
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eyebrow">{T("For MCP server publishers", "Pour les éditeurs de serveurs MCP")}</div>
      <h1>Monitoring Pro</h1>
      <p className="lede">{T("Know within the hour when your hosted MCP server stops answering, before your users tell you.", "Sachez dans l'heure quand votre serveur MCP hébergé ne répond plus, avant que vos utilisateurs ne vous le disent.")}</p>

      {offer ? (
        <div className="offer-box" style={{ marginTop: 20 }}>
          <span className="offer-tag">{T("Exclusive launch offer", "Offre de lancement exclusive")}</span>
          <p className="offer-price">{T(<><b>$39.99 once</b>, monitoring for life</>, <><b>39,99 $ une seule fois</b>, surveillance à vie</>)}</p>
          <p className="offer-was" style={{ margin: "4px 0 0" }}>{T("Instead of", "Au lieu de")} <span className="offer-strike">{T("$9.99/month", "9,99 $/mois")}</span> {T("(about $120 a year)", "(environ 120 $ par an)")} <span className="offer-save">{T("Save 67% in year one", "67 % d'économie dès la première année")}</span></p>
          <p className="small" style={{ margin: "4px 0 12px" }}>{T("One payment, no subscription, nothing more to pay. Available during the launch only.", "Un seul paiement, sans abonnement, plus rien à payer ensuite. Disponible uniquement pendant le lancement.")}</p>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <a className="btn primary" href={LIFETIME_URL} rel="noopener">{T("Get it for $39.99 →", "En profiter pour 39,99 $ →")}</a>
            <span className="small">{T(<>You enter your server address at checkout. Not sure it can be monitored? <a href="#start">Check it first ↓</a></>,
              <>Vous indiquez l&apos;adresse de votre serveur au paiement. Vous ne savez pas s&apos;il peut être surveillé ? <a href="#start">Vérifiez d&apos;abord ↓</a></>)}</span>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>{T("Why it matters", "Pourquoi c'est important")}</h2></div>
        <div className="card-body">
          <div className="grid cols-2" style={{ gap: 16 }}>
            <div className="story story-bad">
              <p className="price-name">{T("Without monitoring", "Sans surveillance")}</p>
              <p style={{ margin: 0 }}>{T("Your MCP server stops answering at 3 a.m. The AI assistants of your users (Claude, ChatGPT, Cursor…) fail silently: no error page, no alert. Your users switch to another tool. You find out three days later, from an unhappy customer.",
                "Votre serveur MCP cesse de répondre à 3 h du matin. Les assistants IA de vos utilisateurs (Claude, ChatGPT, Cursor…) échouent sans rien dire : pas de page d'erreur, pas d'alerte. Vos utilisateurs passent à un autre outil. Vous l'apprenez trois jours plus tard, par un client mécontent.")}</p>
            </div>
            <div className="story story-good">
              <p className="price-name">{T("With Monitoring Pro", "Avec Monitoring Pro")}</p>
              <p style={{ margin: 0 }}>{T("We connect to your server every 30 minutes, exactly like an AI assistant does. If it stops answering twice in a row, you get an email within the hour, and another one when it is back. Your report shows every check, and your badge proves your reliability.",
                "Nous nous connectons à votre serveur toutes les 30 minutes, exactement comme un assistant IA. S'il ne répond pas deux fois de suite, vous recevez un e-mail dans l'heure, puis un autre quand il revient. Votre rapport montre chaque vérification, et votre badge prouve votre fiabilité.")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 24 }}>
        <div className="card"><div className="card-body">
          <p className="price-name">{T("What you get", "Ce que vous obtenez")}</p>
          <ul className="price-list">
            {fr ? <>
              <li>Votre endpoint vérifié <b>toutes les 30 minutes</b> (pages publiques : tous les quelques jours)</li>
              <li>Un <b>e-mail quand il ne répond plus</b> (2 échecs de suite, donc en une heure environ) et quand il revient</li>
              <li>Un <b>rapport privé</b> : taux de réponse sur 30 et 90 jours, chaque panne, chaque vérification</li>
              <li>Un <b>badge de statut</b> pour votre README ou votre site, avec votre taux de réponse sur 30 jours</li>
            </> : <>
              <li>Your endpoint checked <b>every 30 minutes</b> (public pages: every few days)</li>
              <li>An <b>email when it stops answering</b> (2 failed checks in a row, so within about an hour) and when it is back</li>
              <li>A <b>private report</b>: answer rate over 30 and 90 days, every outage, every check</li>
              <li>A <b>status badge</b> for your README or website, with your 30-day answer rate</li>
            </>}
          </ul>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="price-name">{T("How we check", "Comment nous vérifions")}</p>
          <ul className="price-list">
            {fr ? <>
              <li>Nous nous connectons comme un assistant IA : ouverture d&apos;une session MCP et liste des outils</li>
              <li>Nous n&apos;exécutons jamais un outil et n&apos;envoyons jamais de clé (un serveur qui demande une clé compte comme répondant)</li>
              <li>La surveillance ne change jamais votre score ni votre classement sur Electra Index</li>
              <li>Pour les serveurs hébergés (un endpoint https). Un serveur qui tourne uniquement sur l&apos;ordinateur de l&apos;utilisateur ne peut pas être vérifié de l&apos;extérieur</li>
            </> : <>
              <li>We connect like an AI assistant: open an MCP session and list the tools</li>
              <li>We never run a tool and never send a key (a server that asks for a key counts as answering)</li>
              <li>Monitoring never changes your score or rank on Electra Index</li>
              <li>For hosted servers (an https endpoint). A server that runs only on the user&apos;s computer cannot be checked from outside</li>
            </>}
          </ul>
        </div></div>
      </div>

      <div className="card follow-box" style={{ marginTop: 24 }} id="start">
        <div className="card-head"><h2>{offer ? T("Check your server first", "Vérifiez d'abord votre serveur") : T("Start with your server", "Commencez par votre serveur")}</h2><span className="small muted">{T("Optional · then pay by card", "Facultatif · puis paiement par carte")}</span></div>
        <div className="card-body">
          <form method="get" action={`${self}#start`} className="follow-form">
            <ol className="steps-mini">
              <li className={check?.found && check.hosted && !check.active ? "done" : "now"}>{T(<><b>Tell us which server</b> to monitor: its name, its Electra Index page or its endpoint URL. We check that it can be monitored, so you never pay for nothing.</>,
                <><b>Indiquez le serveur</b> à surveiller : son nom, sa page Electra Index ou l&apos;URL de son endpoint. Nous vérifions qu&apos;il peut être surveillé, pour que vous ne payiez jamais pour rien.</>)}</li>
              <li className={check?.found && check.hosted && !check.active ? "now" : ""}>{T(<><b>Pay by card</b> with Stripe{offer ? " ($39.99 once)" : ""}. Your welcome email arrives within a minute.</>,
                <><b>Payez par carte</b> avec Stripe{offer ? " (39,99 $ une seule fois)" : ""}. Votre e-mail de bienvenue arrive en moins d&apos;une minute.</>)}</li>
            </ol>
            <label className="small" htmlFor="server">{T("Your server", "Votre serveur")}</label>
            <div className="follow-row">
              <input id="server" name="server" defaultValue={q} required maxLength={300} placeholder={fr ? "ex. : https://mcp.example.com/mcp" : "e.g. https://mcp.example.com/mcp"} />
              <button type="submit" className="btn dark">{T("Find my server →", "Trouver mon serveur →")}</button>
            </div>
          </form>

          {check ? (
            check.found && check.hosted ? (
              check.active ? (
                <p className="ok-box">{T(<>{check.name} is already monitored. Look for the report link in the welcome email, or write to contact@electraindex.com.</>,
                  <>{check.name} est déjà surveillé. Le lien vers le rapport se trouve dans l&apos;e-mail de bienvenue, ou écrivez à contact@electraindex.com.</>)}</p>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <p style={{ marginTop: 0 }}><span className="badge live-ok">{T("FOUND", "TROUVÉ")}</span> <b>{check.name}</b> · {T("we will check", "nous vérifierons")} <code>{check.url}</code></p>
                  {offer ? (
                    <>
                      <a className="btn primary" href={checkoutLink(check.slug!, LIFETIME_URL)} rel="noopener">{T(<>Monitor {check.name} for life · $39.99 once</>, <>Surveiller {check.name} à vie · 39,99 $ une seule fois</>)}</a>
                      <p className="small" style={{ margin: "8px 0 0" }}>{T(<><b>Launch offer</b>: one payment, no subscription.</>, <><b>Offre de lancement</b> : un seul paiement, sans abonnement.</>)}{on ? T(<> Prefer monthly? <a href={checkoutLink(check.slug!)} rel="noopener">$9.99/month</a>, cancel anytime.</>, <> Vous préférez au mois ? <a href={checkoutLink(check.slug!)} rel="noopener">9,99 $/mois</a>, résiliable à tout moment.</>) : null}</p>
                    </>
                  ) : on ? <a className="btn primary" href={checkoutLink(check.slug!)} rel="noopener">{T(<>Subscribe for {check.name} · $9.99/month</>, <>S&apos;abonner pour {check.name} · 9,99 $/mois</>)}</a>
                      : <p className="small muted">{T("Subscriptions open very soon.", "Les abonnements ouvrent très prochainement.")}</p>}
                  <p className="small muted" style={{ marginBottom: 0 }}>{T(<>Your welcome email arrives within a minute, with your private report link and your badge. Not your endpoint? <Link href={`/mcp/${check.slug}`}>See its page</Link>.</>,
                    <>Votre e-mail de bienvenue arrive en moins d&apos;une minute, avec le lien de votre rapport privé et votre badge. Ce n&apos;est pas votre endpoint ? <Link href={`/mcp/${check.slug}`}>Voir sa page</Link>.</>)}</p>
                </div>
              )
            ) : check.found ? (
              <p className="form-error" style={{ marginTop: 16 }}>{T(<><b>{check.name}</b> has no hosted endpoint in the Official MCP Registry: it seems to run only on the user&apos;s computer, so it cannot be checked from outside. If you host it, publish its URL in the registry, or write to contact@electraindex.com.</>,
                <><b>{check.name}</b> n&apos;a pas d&apos;endpoint hébergé dans l&apos;Official MCP Registry : il semble tourner uniquement sur l&apos;ordinateur de l&apos;utilisateur, et ne peut donc pas être vérifié de l&apos;extérieur. Si vous l&apos;hébergez, publiez son URL dans le registre, ou écrivez à contact@electraindex.com.</>)}</p>
            ) : (
              <div style={{ marginTop: 16 }}>
                <p className="form-error" style={{ marginTop: 0 }}>{T(<>We did not find &quot;{q}&quot; among the hosted servers we index. Try its exact endpoint URL (https://…).</>, <>Nous n&apos;avons pas trouvé « {q} » parmi les serveurs hébergés que nous indexons. Essayez l&apos;URL exacte de son endpoint (https://…).</>)}</p>
                {suggestions.length ? <p className="small">{T("Did you mean:", "Vouliez-vous dire :")} {suggestions.map((s, i) => <span key={s.slug}>{i ? ", " : ""}<Link href={`${self}?server=${s.slug}#start`}>{s.name}</Link></span>)} ?</p> : null}
                <p className="small muted" style={{ marginBottom: 0 }}>{T("We index every server of the Official MCP Registry. Not there yet? Write to contact@electraindex.com and we add it by hand.", "Nous indexons tous les serveurs de l'Official MCP Registry. Le vôtre n'y est pas encore ? Écrivez à contact@electraindex.com et nous l'ajoutons à la main.")}</p>
              </div>
            )
          ) : null}
        </div>
      </div>

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>{T("Questions", "Questions fréquentes")}</h2></div>
        <div className="card-body">
          {fr ? <>
            {offer ? <details open><summary>Que veut dire « à vie » ?</summary><p>Vous payez 39,99 $ une seule fois, sans abonnement ni renouvellement. Nous surveillons votre serveur aussi longtemps qu&apos;Electra Index propose le service Monitoring Pro. Ce prix est une offre de lancement qui prendra fin ; une fois acquise, elle est à vous.</p></details> : null}
            {offer ? <details><summary>Puis-je la transférer sur un autre serveur plus tard ?</summary><p>Oui, un serveur à la fois : écrivez à contact@electraindex.com et nous faisons le changement.</p></details> : null}
            <details><summary>Comment résilier ?</summary><p>L&apos;offre de lancement n&apos;a rien à résilier : elle est payée une seule fois. Pour la formule mensuelle, répondez à n&apos;importe quel e-mail Monitoring Pro ou écrivez à contact@electraindex.com ; aucun paiement n&apos;est prélevé après la résiliation.</p></details>
            <details><summary>Est-ce que cela améliore le classement de mon serveur ?</summary><p>Non. Nous vendons de la surveillance et des données, jamais un score, un classement ni la suppression d&apos;une information. <Link href="/sources#what-we-sell">Ce que nous vendons</Link></p></details>
            <details><summary>Et si mon serveur demande une clé ou une connexion ?</summary><p>Il compte comme répondant : nous vérifions que l&apos;endpoint est en ligne et parle MCP. Nous n&apos;envoyons jamais d&apos;identifiants.</p></details>
            <details><summary>Le badge est-il gratuit ?</summary><p>Chaque serveur listé peut afficher son statut en direct avec le badge <code>https://electraindex.com/api/badge/votre-slug</code>. Avec Monitoring Pro, le badge affiche aussi votre taux de réponse sur 30 jours.</p></details>
          </> : <>
            {offer ? <details open><summary>What does &quot;for life&quot; mean?</summary><p>You pay $39.99 once, with no subscription and no renewal. We monitor your server for as long as Electra Index runs the Monitoring Pro service. This price is a launch offer and will end; once you have it, it is yours.</p></details> : null}
            {offer ? <details><summary>Can I move it to another server later?</summary><p>Yes, one server at a time: write to contact@electraindex.com and we switch it.</p></details> : null}
            <details><summary>How do I cancel?</summary><p>The launch offer has nothing to cancel: it is paid once. For the monthly plan, reply to any Monitoring Pro email or write to contact@electraindex.com; no further payment is taken after cancellation.</p></details>
            <details><summary>Does it make my server rank higher?</summary><p>No. We sell monitoring and data, never a score, a rank or the removal of a fact. <Link href="/sources#what-we-sell">What we sell</Link></p></details>
            <details><summary>What if my server asks for a key or a sign-in?</summary><p>It counts as answering: we check that the endpoint is up and speaks MCP. We never send credentials.</p></details>
            <details><summary>Is the badge free?</summary><p>Every listed server can show its live status with the badge <code>https://electraindex.com/api/badge/your-slug</code>. With Monitoring Pro the badge also shows your 30-day answer rate.</p></details>
          </>}
        </div>
      </div>
    </div>
  );
}
