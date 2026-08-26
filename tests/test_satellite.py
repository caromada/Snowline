from gazetteer import get_pass
from ingest.geo import point_in_ring
from ingest.satellite import _cloudy, modeled_cover_frac, sample_snow_cover

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
