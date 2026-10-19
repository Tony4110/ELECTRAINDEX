import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Electra Index collects, why, and how to remove it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="prose" style={{ maxWidth: 760 }}>
      <div className="eyebrow">Privacy</div>
      <h1>Privacy</h1>
      <p className="lede">Electra Index is published by Dreamotion OÜ (Estonia), the data controller. Contact: <a href="mailto:contact@electraindex.com">contact@electraindex.com</a>.</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>No account, no advertising cookie.</b> You can read every page without giving any personal data.</li>
        <li><b>Email you give us</b>, only when you choose to: in &quot;List your agent&quot; (to handle your listing) or in &quot;Follow&quot; on a page (to tell you when our robots detect a change on it).</li>
        <li><b>Publisher Program</b>: monthly click report, founding offers (live testing, sponsored placements). Only if you joined it. Alerts never depend on it.</li>
        <li><b>Reports and follows</b>: your connection address is turned into a one-way code that changes every day, used only to limit abuse. We do not store the address itself.</li>
        <li><b>Visit statistics</b>: when enabled, cookieless and aggregated, without advertising profiles.</li>
      </ul>
      <h2>What we never do</h2>
      <ul>
        <li>We never publish, sell or share your email.</li>
        <li>An email, a report or a partnership never changes a score or a ranking.</li>
      </ul>
      <h2>How long, and your rights</h2>
      <p>We keep an email until you unsubscribe (one click in any email) or ask us to delete it, and listing requests for up to 24 months. You can ask to access, correct or delete your data at <a href="mailto:contact@electraindex.com">contact@electraindex.com</a>. You can also complain to the Estonian Data Protection Inspectorate (Andmekaitse Inspektsioon).</p>
      <p className="small muted">Our data is hosted with Supabase (database) and Netlify (website), in the European Union where available.</p>
    </div>
  );
}
