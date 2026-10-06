"""Sourcing intake — turn a simple candidates CSV into a draft agents JSON.

Workflow (keeps prod in your hands, no secrets, your paste-the-SQL flow):
  1. Add rows to a CSV in data/candidates/  (columns below).
  2. Run:  python3 scripts/candidates_to_agents.py
     → dedups against the agents already in data/agents/*.json (by domain + name)
     → writes data/candidates/_draft_agents.json  (skeletons for the NEW ones only)
  3. Verify/enrich each skeleton (pricing, capabilities) — honestly, every fact sourced.
  4. Move the verified records into a file in data/agents/ (e.g. data/agents/fr_batch1.json).
  5. Run:  python3 scripts/build_agents_seed.py
     → regenerates supabase/INSTALL_AGENTS_1.sql  → you paste it in Supabase.

CSV columns (header required):
  name,website,theme,country,source_url,notes
  - theme MUST be one of the 10 valid themes (see VALID_THEMES below).
  - source_url = where you found it (kept as the provenance note).
"""
import csv, json, glob, re, pathlib, sys, datetime

root = pathlib.Path(__file__).resolve().parent.parent
TODAY = datetime.date.today().isoformat()

VALID_THEMES = {
    "Coding", "Research", "Marketing", "Sales", "Customer Support",
    "Finance", "Data", "Productivity", "Browser & Computer Use", "Business Operations",
}

def dom(u: str) -> str:
    return re.sub(r"^www\.", "", re.sub(r"^https?://", "", (u or "").lower().strip())).split("/")[0]

def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")

# --- existing agents (to dedup against) ---
existing_dom, existing_slug = set(), set()
for f in glob.glob(str(root / "data/agents/*.json")):
    for a in json.load(open(f)):
        existing_dom.add(dom(a.get("website", "")))
        existing_slug.add(slug(a.get("name", "")))

# --- read candidates ---
rows, seen = [], set()
files = [f for f in glob.glob(str(root / "data/candidates/*.csv")) if not pathlib.Path(f).name.startswith("_")]
if not files:
    print("No candidate CSVs in data/candidates/ (ignoring files starting with _).")
    print("Create one with columns: name,website,theme,country,source_url,notes")
    sys.exit(0)

new, dupes, bad = [], [], []
for f in files:
    for r in csv.DictReader(open(f)):
        name = (r.get("name") or "").strip()
        site = (r.get("website") or "").strip()
        theme = (r.get("theme") or "").strip()
        if not name or not site:
            continue
        d, s = dom(site), slug(name)
        if theme and theme not in VALID_THEMES:
            bad.append(f"{name} — invalid theme '{theme}'")
            continue
        if d in existing_dom or s in existing_slug or (d, s) in seen:
            dupes.append(name)
            continue
        seen.add((d, s))
        new.append({
            "name": name,
            "company": (r.get("company") or "").strip() or None,
            "website": site,
            "theme": theme,
            "short_description": (r.get("notes") or "").strip(),
            "capabilities": [],
            "pricing_url": site,
            "pricing_verified": False,
            "checked_at": TODAY,
            "plans": [],
            "free_plan": None,
            "free_trial": None,
            "api": None,
            "mcp": None,
            "open_source": False,
            "github_repo": None,
            "country": (r.get("country") or "").strip() or None,
            "notes": f"source: {(r.get('source_url') or '').strip()}" if r.get("source_url") else "",
        })

out = root / "data/candidates/_draft_agents.json"
out.write_text(json.dumps(new, ensure_ascii=False, indent=2))

print(f"Candidates read from {len(files)} file(s).")
print(f"  NEW (not yet in index): {len(new)}  → written to {out.relative_to(root)}")
print(f"  Duplicates skipped:     {len(dupes)}")
if dupes:
    print("    " + ", ".join(sorted(dupes)[:30]) + (" …" if len(dupes) > 30 else ""))
if bad:
    print(f"  Rejected (bad theme):   {len(bad)}")
    for b in bad:
        print("    " + b)
print("\nNext: verify/enrich the skeletons, move them into data/agents/<batch>.json, then run build_agents_seed.py.")
