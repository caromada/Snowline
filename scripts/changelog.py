"""Write web/lib/changelog.json from the commit log.

The marketing page shows what shipped lately. Data refreshes and export
churn are not product changes, so they are left out.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

SKIP = ("Daily ingest", "Refresh exports")
# Agency names stay out of marketing copy.
SCRUB = ("NWS ", "USGS ", "CDEC ", "SNOTEL ", "NRCS ")
OUT = Path(__file__).resolve().parents[1] / "web" / "lib" / "changelog.json"
KEEP = 7


def main() -> None:
    log = subprocess.run(
        ["git", "log", "--date=short", "--format=%ad%x09%s", "-n", "200"],
        check=True, capture_output=True, text=True,
    ).stdout
    rows = []
    for line in log.splitlines():
        date, _, subject = line.partition("\t")
        if subject.startswith(SKIP):
            continue
        for word in SCRUB:
            subject = subject.replace(word, "")
        rows.append({"date": date, "title": subject})
        if len(rows) == KEEP:
            break
    OUT.write_text(json.dumps(rows, indent=2) + "\n")
    print(f"wrote {len(rows)} entries to {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
