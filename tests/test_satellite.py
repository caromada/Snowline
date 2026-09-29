from datetime import date, timedelta
from typing import Any

from gazetteer import get_pass
from ingest.geo import point_in_ring
from ingest.satellite import _cloudy, modeled_cover_frac, modeled_scenes, sample_snow_cover

SQUARE = {
    "type": "Polygon",
    "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]],
}


def test_point_in_ring() -> None:
    ring = SQUARE["coordinates"][0]
    assert point_in_ring(0.5, 0.5, ring)
    assert not point_in_ring(1.5, 0.5, ring)
    glen = get_pass("glen")
    assert glen is not None
    gring = glen["polygon"]["coordinates"][0]
    assert point_in_ring(glen["lon"], glen["lat"], gring)
    assert not point_in_ring(glen["lon"] + 0.1, glen["lat"], gring)


def test_sample_half_snow() -> None:
    samples = [
        (0.25, 0.25, 0.8, False),
        (0.75, 0.25, 0.9, False),
        (0.25, 0.75, 0.1, False),
        (0.75, 0.75, 0.0, False),
    ]
    result = sample_snow_cover(SQUARE, samples)
    assert result is not None
    assert result["snow_cover_frac"] == 0.5
    assert result["cloud_frac"] == 0.0


def test_cloudy_scene_is_masked() -> None:
    samples = [
        (0.25, 0.25, 0.8, True),
        (0.75, 0.25, 0.9, True),
        (0.25, 0.75, 0.1, True),
        (0.75, 0.75, 0.0, False),
    ]
    assert sample_snow_cover(SQUARE, samples) is None


def test_outside_samples_ignored() -> None:
    samples = [(5.0, 5.0, 0.9, False)]
    assert sample_snow_cover(SQUARE, samples) is None


def test_modeled_cover_monotonic_in_swe() -> None:
    high = modeled_cover_frac(30.0, 11900, 10400)
    mid = modeled_cover_frac(10.0, 11900, 10400)
    zero = modeled_cover_frac(0.0, 11900, 10400)
    assert high == 1.0
    assert 0.0 < mid < 1.0
    assert zero == 0.0


def test_modeled_cover_elevation_bonus() -> None:
    # Same SWE reads as more cover on a pass far above its station.
    assert modeled_cover_frac(8.0, 13100, 10400) > modeled_cover_frac(8.0, 10500, 10400)


def test_cloud_gaps_deterministic() -> None:
    assert _cloudy("glen", "2023-06-01") == _cloudy("glen", "2023-06-01")
    days = [f"2023-06-{d:02d}" for d in range(1, 31)]
    cloudy = sum(1 for d in days if _cloudy("glen", d))
    assert 2 <= cloudy <= 18


# -- modeled scenes and sensor faults ----------------------------------------


KEARSARGE = {"slug": "kearsarge", "elevation_ft": 11709, "lon": -118.38, "lat": 36.77}


def curve(values: list[float], first_day: str, elev_ft: float = 10400) -> list[dict[str, Any]]:
    start = date.fromisoformat(first_day)
    return [
        {
            "metric": "swe_in",
            "observed_date": (start + timedelta(days=i)).isoformat(),
            "value": v,
            "provenance": "cdec:CRL",
            "meta": {"station_elevation_ft": elev_ft},
        }
        for i, v in enumerate(values)
    ]


def scene_days(rows: list[dict[str, Any]]) -> list[str]:
    return [day for day, _, _ in modeled_scenes(KEARSARGE, rows)]


MELT = [30.0 - 0.5 * i for i in range(40)]


def test_modeled_scenes_follow_the_station_curve() -> None:
    scenes = modeled_scenes(KEARSARGE, curve(MELT, "2023-06-01"))
    assert scenes
    for day, frac, row in scenes:
        assert row["observed_date"] == day
        assert frac == modeled_cover_frac(row["value"], 11709, 10400)


def test_no_scene_is_modeled_from_an_impossible_reading() -> None:
    faulty = list(MELT)
    faulty[12:24] = [391.82] * 12
    clean_days = scene_days(curve(MELT, "2023-06-01"))
    days = scene_days(curve(faulty, "2023-06-01"))
    lost = {f"2023-06-{d:02d}" for d in range(13, 25)}
    assert lost & set(clean_days)
    # Only the faulty days go missing: the revisit cycle does not shift.
    assert days == [d for d in clean_days if d not in lost]


def test_no_scene_is_modeled_from_a_sensor_known_to_be_stuck() -> None:
    stuck = MELT[:10] + [25.0] * 30
    clean_days = scene_days(curve(MELT, "2023-06-01"))
    days = scene_days(curve(stuck, "2023-06-01"))
    # Stuck from June 11. On June 17 the week is complete and the sensor is
    # known to be stuck; the six days before that looked fine as they came.
    assert [d for d in days if d >= "2023-06-17"] == []
    assert [d for d in days if d < "2023-06-17"] == [d for d in clean_days if d < "2023-06-17"]


def test_a_melted_out_station_near_the_pass_still_models_bare_ground() -> None:
    scenes = modeled_scenes(KEARSARGE, curve([0.0] * 30, "2023-08-01", elev_ft=11600))
    assert scenes
    assert {frac for _, frac, _ in scenes} == {0.0}
