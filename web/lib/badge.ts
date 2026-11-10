/** Shared SVG badge builder (shields.io style). */
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
// rough width of Verdana 11px text (shields.io style)
const w = (s: string) => Math.round([...s].reduce((n, ch) => n + (/[il.:|' ]/.test(ch) ? 3.6 : /[mwMW%]/.test(ch) ? 9.5 : /[A-Z0-9]/.test(ch) ? 7.5 : 6.4), 0)) + 12;

export function svg(label: string, value: string, color: string) {
  const lw = w(label), vw = w(value), W = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${W}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#121816"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><rect width="${W}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + vw / 2}" y="14">${esc(value)}</text></g></svg>`;
}


/**
 * Larger "card" badge for websites (260x72): brand line, product status line, proof line.
 * Same data as the small badge, styled to sit in a website footer or pricing page.
 */
export function card(line: string, sub: string, color: string) {
  const W = 260, H = 72;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Electra Index: ${esc(line)}">
<title>Electra Index: ${esc(line)}</title>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="#FFFFFF" stroke="#DCE0DB"/>
<rect x="12" y="12" width="48" height="48" rx="10" fill="${color}"/>
<path d="M36 22 L27 38 H35 L33 50 L45 32 H37 Z" fill="#F5B82E"/>
<g font-family="Arial,Helvetica,sans-serif">
<text x="72" y="27" font-size="10" font-weight="700" letter-spacing="1.2" fill="#56615C">LISTED ON ELECTRA <tspan fill="#1F3FD1">INDEX</tspan></text>
<text x="72" y="45" font-size="15" font-weight="700" fill="#121816">${esc(line)}</text>
<text x="72" y="61" font-size="11" fill="#56615C">${esc(sub)}</text>
</g></svg>`;
}
