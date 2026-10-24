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

// ---- French ---------------------------------------------------------------
/** "A", "A et B", "A, B et C" (French names, lower-cased after the first word). */
export function capListFr(names: string[]): string {
  const n = names.map((x) => (/^[A-Z][a-zé]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x));
  if (n.length === 0) return "les fonctionnalités requises";
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(", ")} et ${n[n.length - 1]}`;
}
const lowFr = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function taskMetaDescriptionFr(name: string, caps: string[]): string {
  const cov = caps.length > 0 && caps.length <= 2 ? `leur couverture (${capListFr(caps)})` : "leur couverture des fonctionnalités";
  return `Comparez les agents IA pour ${lowFr(name)} : classés selon ${cov}, leur qualité, leurs prix et des preuves vérifiées par Electra.`;
}

export function taskIntroFr(name: string, caps: string[], fullCount: number, leaders: string[]): string {
  const nCaps = caps.length;
  const all = nCaps > 2 ? `les ${nCaps}` : nCaps === 2 ? "les deux" : "celle-ci";
  let middle: string;
  if (fullCount > 0) {
    middle = `${fullCount} agent${fullCount > 1 ? "s" : ""} IA ${fullCount > 1 ? "les couvrent" : "les couvre"}${nCaps === 1 ? "" : " toutes"}`;
    if (nCaps === 1) middle = `${fullCount} agent${fullCount > 1 ? "s" : ""} IA ${fullCount > 1 ? "la couvrent" : "la couvre"}`;
    if (leaders.length) middle += `, avec en tête ${leaders.join(" et ")}`;
    middle += ".";
  } else {
    middle = `Aucun agent IA ne couvre encore ${all} ; la liste ci-dessous est classée selon la part de la tâche que chacun couvre.`;
  }
  return `Pour ${lowFr(name)}, un agent IA a besoin de : ${capListFr(caps)}. ${middle} Les agents sont classés selon la façon dont ils couvrent la tâche, complètement et de manière fiable, puis selon le Score Agent d'Electra, fondé sur des preuves.`;
}
