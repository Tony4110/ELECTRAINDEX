// Page-view analytics — provider-agnostic, set ONE env var in Netlify and it turns on.
// All three options below are cookieless-capable; nothing renders until a var is set,
// so the site stays clean until you choose.
//
//   Cloudflare Web Analytics (free, cookieless, no banner)  → NEXT_PUBLIC_CF_BEACON=<token>
//   Plausible (paid/self-host, cookieless, no banner)       → NEXT_PUBLIC_PLAUSIBLE_DOMAIN=electraindex.com
//   Google Analytics 4 (free, powerful, needs consent in EU)→ NEXT_PUBLIC_GA_ID=G-XXXXXXX
//
// Recommended to start: Cloudflare — free, no cookie banner, 1 token.

import Script from "next/script";

export function Analytics() {
  const cf = process.env.NEXT_PUBLIC_CF_BEACON;
  const plausible = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const ga = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <>
      {cf && (
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={JSON.stringify({ token: cf })}
          strategy="afterInteractive"
        />
      )}
      {plausible && (
        <Script
          src="https://plausible.io/js/script.js"
          data-domain={plausible}
          strategy="afterInteractive"
        />
      )}
      {ga && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
    </>
  );
}
