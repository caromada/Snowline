"""Named places and the passes near them, for the trip planner.

People describe a trip by where it starts ("from Stuart Lake", "out of Onion
Valley") as often as by the passes it crosses. This inverts the access
snapshot: for every named trailhead and campground, the passes within reach
of it, nearest first. Distances are straight lines, as everywhere else.
"""

from __future__ import annotations

from typing import Any

from gazetteer.access import KM_PER_MI, TRAILHEAD_RADIUS_KM, _within

# A place vouches for the passes around it, not for a whole range. A
# campground is where a trip sleeps, so it speaks for less ground than the
# trailhead the trip starts from.
REACH_KM = {"trailhead": TRAILHEAD_RADIUS_KM, "campground": 12.0}
NEAREST = {"trailhead": 6, "campground": 4}
FEATURED = 4

# Names OpenStreetMap gives to places that have no name of their own.
_NAMELESS = {
    "trailhead", "dispersed camping", "dispersed camping area", "primitive camping area",
    "primitive campsite", "backcountry camping", "hiker/biker", "horse camp", "campground",
    "camping area", "group camp",
}


def place_index(
    passes: list[dict[str, Any]],
    trailheads: list[dict[str, Any]],
    campgrounds: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """One record per named place that has at least one pass within reach."""
    out: list[dict[str, Any]] = []
    for kind, places in (("trailhead", trailheads), ("campground", campgrounds)):
        for place in places:
            name = (place.get("name") or "").strip()
            if not name or name.lower() in _NAMELESS:
                continue
            near = _within(place["lat"], place["lon"], passes, REACH_KM[kind])
            # Featured passes are the ones people plan trips around; they keep
            # their seat when a crowd of minor saddles sits closer.
            featured = [hit for hit in near if hit[1].get("tier") == "featured"]
            kept: dict[str, tuple[float, dict[str, Any]]] = {}
            for km, p in [*near[: NEAREST[kind]], *featured[:FEATURED]]:
                kept.setdefault(p["slug"], (km, p))
            if not kept:
                continue
            out.append(
                {
                    "name": name,
                    "kind": kind,
                    # [slug, straight-line miles], nearest first.
                    "passes": [
                        [p["slug"], round(km / KM_PER_MI, 1)]
                        for km, p in sorted(kept.values(), key=lambda hit: hit[0])
                    ],
                }
            )
    out.sort(key=lambda rec: (rec["name"], rec["kind"], rec["passes"]))
    return out
