#!/usr/bin/env python3
"""Create the versioned Overture snapshot accepted by Admin > Ortsimporte."""

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.request import urlopen

import pyarrow.parquet as pq
from shapely import Point
from shapely.geometry import shape
from shapely.prepared import prep

BOUNDARY_URL = (
    "https://api3.geo.admin.ch/rest/services/ech/MapServer/"
    "ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill/2701"
    "?geometryFormat=geojson&sr=4326"
)
CATEGORY = {
    "restaurant": "RESTAURANT", "casual_eatery": "RESTAURANT",
    "fast_food_restaurant": "RESTAURANT", "food_court": "RESTAURANT",
    "coffee_shop": "CAFE", "cafe": "CAFE", "ice_cream_shop": "CAFE",
    "bar": "BAR", "lounge": "BAR", "alcoholic_beverage_venue": "BAR",
    "dance_club": "NIGHTCLUB",
}
LICENSES = {"CDLA-Permissive-2.0", "Apache-2.0", "CC0-1.0"}
COLUMNS = [
    "id", "names", "basic_category", "bbox", "confidence",
    "operating_status", "addresses", "phones", "websites", "sources",
]


def basel_polygon(boundary):
    feature, = boundary["features"]
    if str(feature["featureId"]) != "2701" or feature["properties"]["gemname"] != "Basel":
        raise ValueError("Expected the official boundary of the municipality of Basel")
    return shape(feature["geometry"])


def build_snapshot(path, geometry, release):
    polygon = prep(geometry)
    places = []
    for batch in pq.ParquetFile(path).iter_batches(columns=COLUMNS):
        for place in batch.to_pylist():
            category = CATEGORY.get(place["basic_category"])
            confidence = place["confidence"] or 0
            name = ((place["names"] or {}).get("primary") or "").strip()
            longitude, latitude = (place["bbox"][key] for key in ("xmin", "ymin"))
            if (not category or not 1 <= len(name) <= 160 or confidence < 0.6
                    or place["operating_status"] in {"temporarily_closed", "permanently_closed"}
                    or not polygon.covers(Point(longitude, latitude))):
                continue
            addresses = place["addresses"] or []
            address = next((entry["freeform"] for entry in addresses
                            if entry["country"] in ("CH", None) and entry["freeform"]), None)
            sources = {(entry["dataset"], entry["license"]) for entry in (place["sources"] or [])
                       if entry["dataset"] and entry["license"] in LICENSES}
            places.append({
                "id": place["id"], "name": name, "category": category,
                "lat": latitude, "lng": longitude, "confidence": confidence,
                "address": address, "phone": next(iter(place["phones"] or []), None),
                "website": next(iter(place["websites"] or []), None),
                "sources": [{"dataset": dataset, "license": license} for dataset, license in sorted(sources)],
            })
    if not 1 <= len(places) <= 2500 or len({place["id"] for place in places}) != len(places):
        raise ValueError("Snapshot size or place identities are invalid")
    return {"release": release, "rows": sorted(places, key=lambda place: place["id"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", required=True, help="Overture release such as 2026-10-21.0")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--parquet", type=Path, help="Use an already downloaded Basel Parquet file for this release")
    parser.add_argument("--boundary", type=Path, help="Use an already downloaded official Basel municipality feature")
    args = parser.parse_args()
    if not re.fullmatch(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}\.[0-9]{1,2}", args.release):
        parser.error("Invalid release format")

    if args.boundary:
        polygon = basel_polygon(json.loads(args.boundary.read_text()))
    else:
        with urlopen(BOUNDARY_URL, timeout=30) as response:
            polygon = basel_polygon(json.load(response))

    with tempfile.TemporaryDirectory(prefix="backyrd-overture-") as directory:
        parquet = args.parquet
        if parquet is None:
            parquet = Path(directory) / "basel.parquet"
            subprocess.run([
                "overturemaps", "download", "--release", args.release,
                "--bbox", ",".join(map(str, polygon.bounds)), "-f", "geoparquet",
                "-t", "place", "-o", str(parquet),
            ], check=True, timeout=300)
        snapshot = build_snapshot(parquet, polygon, args.release)

    encoded = (json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if len(encoded) > 1_800_000:
        raise ValueError("Snapshot exceeds the Admin upload limit")
    with args.output.open("xb") as output:
        output.write(encoded)
    print(f"{len(snapshot['rows'])} places from {args.release}")


if __name__ == "__main__":
    main()
