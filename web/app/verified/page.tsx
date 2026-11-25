import type { Metadata } from "next";
import Link from "next/link";
import { VerifiedForm } from "@/components/verified-form";

export const metadata: Metadata = {
  title: "Electra Verified: free monitoring for MCP servers that show our badge",
  description: "Show the Electra Index badge on your site or README: your hosted MCP server is tested every 12 hours, you get an email when it stops answering, and the badge shows its live status and 30-day availability. Free. Never changes a score or a ranking.",
  alternates: { canonical: "/verified" },
};
export const dynamic = "force-dynamic";

export default async function VerifiedPage({ searchParams }: { searchParams: Promise<{ server?: string }> }) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eyebrow">For MCP server publishers · free</div>
      <h1>Electra Verified</h1>
      <p className="lede">Show the Electra Index badge on your website or README. As long as it is there, we test your hosted MCP server every 12 hours, email you when it stops answering, and the badge shows its live status and 30-day availability.</p>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Three plans, the same score for everyone</h2></div>
        <div className="card-body table-wrap">
          <table className="table">
            <thead><tr><th></th><th>Listed</th><th>Electra Verified</th><th>Monitoring Pro</th></tr></thead>
            <tbody>
              <tr><td>Price</td><td>Free</td><td><b>Free, while our badge is shown</b></td><td>$29.99 a year (founding price) or $9.99/month</td></tr>
              <tr><td>Live tests</td><td>About every 2 days</td><td><b>Every 12 hours</b>, a failure confirmed 30 minutes later</td><td>Every 30 minutes</td></tr>
              <tr><td>Outage emails</td><td>–</td><td>✓</td><td>✓ within the hour</td></tr>
              <tr><td>Badge</td><td>Live status</td><td>Live status + 30-day availability</td><td>Live status + 30-day availability</td></tr>
              <tr><td>Private 90-day report</td><td>–</td><td>–</td><td>✓</td></tr>
              <tr><td>Score and ranking</td><td colSpan={3}>Identical. Verified and Pro add tests, never points. <Link href="/sources#reliability">How we measure</Link></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card follow-box" style={{ marginTop: 24 }} id="start">
        <div className="card-head"><h2>Get Verified</h2><span className="small muted">Pilot: first 50 servers, then a waiting list</span></div>
        <div className="card-body">
          <ol className="steps-mini">
            <li><b>Add the badge</b> of your server to your website or README. Copy it from the <b>Share</b> box of your page on Electra Index (electraindex.com/mcp/your-server#share).</li>
            <li><b>Tell us</b> which server, the page that shows the badge, and an email for outage alerts.</li>
            <li><b>Confirm</b> with the button in our email. We find the badge, usually within 15 minutes, and Verified starts.</li>
          </ol>
          <VerifiedForm server={sp.server ?? ""} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Questions</h2></div>
        <div className="card-body faq">
          <details><summary>How do you check the badge?</summary><p>Our robot reads the page you gave us once a week and looks for a link or image pointing to your server&apos;s page on Electra Index. The page must be on your own domain (your website or your endpoint&apos;s domain) or your server&apos;s GitHub repository.</p></details>
          <details><summary>What if I remove the badge?</summary><p>We email you and keep Verified for 7 more days. After that, your server goes back to our standard tests (about every 2 days) and outage emails stop. Your page and score do not change.</p></details>
          <details><summary>Does Verified make my server look more reliable?</summary><p>No. The badge shows what we measured, the same calculation for every server. When your server stops answering, the badge says so: one failed test shows &quot;checking&quot;, two in a row &quot;not responding&quot;. Electra Index sells and gives monitoring, never reputation.</p></details>
          <details><summary>Is the badge link good for SEO?</summary><p>The badge link is marked nofollow: it is a proof of independent monitoring, not a backlink exchange.</p></details>
          <details><summary>I need more than every 12 hours.</summary><p><Link href="/monitor">Monitoring Pro</Link> tests every 30 minutes, emails you within the hour and gives you a private 90-day report.</p></details>
        </div>
      </div>
    </div>
  );
}
