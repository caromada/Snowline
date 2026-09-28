from ingest.cdec import parse_station_search

TABLE = """
<table><tr><th>ID</th><th>Station Name</th><th>River Basin</th><th>County</th>
<th>Longitude</th><th>Latitude</th><th>Elevation Feet</th><th>Operator</th><th>Map</th></tr>
<tr><td><a href="staMeta?station_id=BLK">BLK</a></td><td>BLUE LAKES</td><td>MOKELUMNE</td>
<td>ALPINE</td><td>-119.924575</td><td>38.607597</td><td>7,990</td><td>NRCS</td><td></td></tr>
<tr><td>XX</td><td>not a station row</td></tr>
</table>
"""


def test_station_search_rows_parse() -> None:
    assert parse_station_search(TABLE) == [
        {
            "station_id": "BLK",
            "name": "Blue Lakes",
            "lon": -119.924575,
            "lat": 38.607597,
            "elevation_ft": 7990,
        }
    ]
