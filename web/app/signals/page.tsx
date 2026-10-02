import type { Metadata } from "next";
import { db, getSignals } from "@/lib/db";
import { SignalItem, Empty, SetupNotice } from "@/components/ui";

export const metadata: Metadata = { alternates: { canonical: "/new?tab=changes" }, robots: { index: false, follow: true }, title: "Signals", description: "Live changes detected across the agent economy: new versions, new servers, access changes, prices." };

export default async function Signals() {
  if (!db()) return <SetupNotice />;
  const signals = await getSignals(100);
  return (
    <>
      <div className="eyebrow">Signals</div>
      <h1>What changed</h1>
      <p className="lede">Every change detected by our robots, with the old and the new value. A change is only reported when there is a previous observation to compare with.</p>
      <div className="card" style={{ marginTop: 24 }}>
        {signals.length === 0 ? <div className="card-body"><Empty title="No signals yet">Signals appear as soon as a robot sees something change.</Empty></div> : (
          <ul className="signals">{signals.map((s) => <SignalItem key={s.id} s={s} />)}</ul>
        )}
      </div>
    </>
  );
}
