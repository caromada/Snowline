"""Write web/public/data/places.json: named trailheads and campgrounds with
the passes near each, which the trip planner reads to place a trip that
names where it starts and not what it crosses.

The file depends only on the gazetteer and the access snapshot, so it is
rebuilt when either of those changes, not daily.

Usage: python -m scripts.build_trip_places
"""

from __future__ import annotations

import json
import logging

from config import WEB_DATA_DIR
from gazetteer import load_passes
from gazetteer.access import load_access
from gazetteer.places import place_index

log = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    access = load_access()
    places = place_index(load_passes(), access["trailheads"], access["campgrounds"])
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = WEB_DATA_DIR / "places.json"
    # No timestamp inside: the same inputs must write the same bytes, so a
    # rebuild that changes nothing leaves nothing to commit.
    path.write_text(json.dumps({"places": places}, separators=(",", ":")))
    log.info("wrote %d places to %s", len(places), path)


if __name__ == "__main__":
    main()
