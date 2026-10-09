import { lowerFirst } from "./format";

/** A readable list of capability names: "A", "A and B", "A, B and C". */
export function capList(caps: { name: string }[]): string {
  const n = caps.map((c) => c.name);
  if (n.length === 0) return "the required capabilities";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

/** Dynamic, per-task meta description. Names the real required capabilities;
 *  never claims a count or a verification level (those vary with the data). */
export function taskMetaDescription(name: string, caps: { name: string }[]): string {
  const cov = caps.length > 0 && caps.length <= 2 ? `${capList(caps)} coverage` : "capability coverage";
  return `Compare AI agents that ${lowerFirst(name)} — ranked by ${cov}, quality, pricing and verified evidence from Electra.`;
}

/** Short factual intro built from the task's own capabilities and results.
 *  fullCount = agents covering every required capability (from the DB count);
 *  leaders   = up to two of those agents, highest quality first. */
export function taskIntro(
  name: string,
  caps: { name: string }[],
  fullCount: number,
  leaders: string[],
): string {
  const nCaps = caps.length;
  const all = nCaps > 2 ? `all ${nCaps}` : nCaps === 2 ? "both" : "it";
  let middle: string;
  if (fullCount > 0) {
    middle = `${fullCount} AI ${fullCount === 1 ? "agent covers" : "agents cover"} ${all}`;
    if (leaders.length) middle += `, led by ${leaders.join(" and ")}`;
    middle += ".";
  } else {
    middle = `No AI agent covers ${all} yet; the list below is ordered by how much of the task each one covers.`;
  }
  return `To ${lowerFirst(name)}, an AI agent needs ${capList(caps)}. ${middle} Agents are ranked by how completely and how reliably they cover the task, then by Electra's evidence-based Agent Score.`;
}
