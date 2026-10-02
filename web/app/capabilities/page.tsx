import Link from "next/link";
import type { Metadata } from "next";
import { db, getTasks, type Capability } from "@/lib/db";
import { SetupNotice } from "@/components/ui";

export const metadata: Metadata = { title: "Capabilities", description: "The 50 capabilities used to match AI agents to tasks.", alternates: { canonical: "/capabilities" } };

export default async function Capabilities() {
  const c = db();
  if (!c) return <SetupNotice />;
  const [{ data }, tasks] = await Promise.all([c.from("v_capabilities").select("*").order("name"), getTasks()]);
  const caps = (data as Capability[] | null) ?? [];

  return (
    <>
      <div className="eyebrow">{caps.length} capabilities</div>
      <h1>Capabilities</h1>
      <p className="lede">The building blocks behind every task. An agent is linked to a capability only when a source documents it.</p>
      <div className="card table-wrap" style={{ marginTop: 24 }}>
        <table>
          <thead><tr><th>Capability</th><th>Used by tasks</th><th>Agents documenting it</th></tr></thead>
          <tbody>
            {caps.map((cap) => {
              const used = tasks.filter((t) => t.capabilities.some((x) => x.slug === cap.slug));
              return (
                <tr key={cap.slug} id={cap.slug}>
                  <td className="strong">{cap.name}</td>
                  <td className="small">
                    <span className="mono">{cap.tasks_count}</span>{" "}
                    <span className="muted">{used.slice(0, 3).map((t, i) => <span key={t.slug}>{i ? " · " : "— "}<Link href={`/tasks/${t.slug}`}>{t.name}</Link></span>)}{used.length > 3 ? " …" : ""}</span>
                  </td>
                  <td className="mono">{cap.providers_count > 0 ? cap.providers_count : <span className="faint">classification in progress</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
