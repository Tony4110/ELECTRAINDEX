import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advertise on Electra Index",
  description: "Reach people researching, comparing and choosing AI agents. Sponsors are always labelled, and sponsorship never changes a ranking.",
  alternates: { canonical: "/advertise" },
};

const RULES = [
  ["Labelled", "Sponsors are always labelled “Sponsored”."],
  ["Independent", "Sponsorship never affects rankings, scores or verification."],
  ["Kept separate", "Never placed inside rankings, comparisons or the methodology page."],
];

const PLACEMENTS = [
  ["Homepage", "Beside the title on the home page."],
  ["Agent profile", "A 300×600 half page on an agent profile."],
  ["New listings", "A “Featured launch” card above the list."],
  ["Blog articles", "At the end of an article."],
  ["Payments page", "On the payments page, outside the tables."],
];

export default function AdvertisePage() {
  return (
    <>
      <div className="eyebrow">Sponsors</div>
      <h1>Advertise on Electra Index</h1>
      <p className="lede">Reach people researching, comparing and choosing AI agents.</p>

      <div className="tiles" style={{ marginTop: 28 }}>
        {RULES.map(([title, text]) => (
          <div className="tile" key={title}>
            <span className="name">{title}</span>
            <span className="small muted">{text}</span>
          </div>
        ))}
      </div>

      <h2 style={{ margin: "40px 0 12px" }}>Placements</h2>
      <div className="tiles">
        {PLACEMENTS.map(([title, text]) => (
          <div className="tile" key={title}>
            <span className="name">{title}</span>
            <span className="small muted">{text}</span>
          </div>
        ))}
      </div>

      <div className="card founding-sponsor">
        <div className="card-head"><h2>Founding Sponsor</h2></div>
        <div className="card-body">
          <p style={{ margin: "0 0 16px" }}>A limited number of places. Launch pricing is guaranteed for the first year.</p>
          <a className="btn primary" href="mailto:advertise@electraindex.com?subject=Electra%20Index%20-%20Founding%20Sponsor">Contact us</a>
        </div>
      </div>
    </>
  );
}
