from gazetteer import get_pass, load_passes, resolve


def test_all_passes_have_polygons() -> None:
    passes = load_passes()
    assert len(passes) >= 500
    assert sum(1 for p in passes if p["tier"] == "featured") == 33
    slugs = [p["slug"] for p in passes]
    assert len(slugs) == len(set(slugs))
    for p in passes:
        ring = p["polygon"]["coordinates"][0]
        assert ring[0] == ring[-1]
        assert len(ring) == 9
        assert isinstance(p["elevation_ft"], int)


def test_exact_and_alias_resolution() -> None:
    assert resolve("Glen Pass") == "glen"
    assert resolve("Glen") == "glen"
    assert resolve("the pass after Rae Lakes") == "glen"
    assert resolve("Muir hut") == "muir"


def test_substring_resolution_in_sentence() -> None:
    assert resolve("we went over kearsarge pass at 7am") == "kearsarge"
    assert resolve("topped out on Forrester around noon") == "forester"


def test_fuzzy_resolution() -> None:
    assert resolve("Kersarge") == "kearsarge"
    assert resolve("Donahue pss") == "donohue"


def test_no_match_returns_none() -> None:
    assert resolve("Half Dome cables") is None
    assert resolve("") is None
    assert resolve(None) is None


def test_get_pass() -> None:
    glen = get_pass("glen")
    assert glen is not None and glen["elevation_ft"] == 11926
    assert get_pass("nope") is None
