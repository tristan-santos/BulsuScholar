import json
import re
import unicodedata
from pathlib import Path
from typing import Any


CATALOG_PATH = Path(__file__).resolve().parent.parent / "shared" / "region3Locations.json"


def normalize_location(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(character for character in text if not unicodedata.combining(character)).lower()
    text = re.sub(r"\b(?:city|municipality)\s+of\b", " ", text)
    text = re.sub(r"\bcity\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    normalized = re.sub(r"\s+", " ", text).strip()
    return {"baliuag": "baliwag"}.get(normalized, normalized)


def _load_catalog() -> dict[str, list[str]]:
    raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not raw:
        raise RuntimeError("region3_location_catalog_invalid")
    return {
        str(province): [str(municipality) for municipality in municipalities]
        for province, municipalities in raw.items()
        if isinstance(municipalities, list)
    }


REGION3_LOCATIONS = _load_catalog()
PROVINCE_LOOKUP = {normalize_location(province): province for province in REGION3_LOCATIONS}
MUNICIPALITY_LOOKUP = {
    province: {normalize_location(municipality): municipality for municipality in municipalities}
    for province, municipalities in REGION3_LOCATIONS.items()
}


def canonicalize_scope_locations(values: Any) -> list[dict[str, str]]:
    if not isinstance(values, list):
        raise ValueError("invalid_scope_locations")
    output: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for value in values:
        if not isinstance(value, dict):
            raise ValueError("invalid_scope_location")
        province = PROVINCE_LOOKUP.get(normalize_location(value.get("province")))
        if not province:
            raise ValueError("scope_province_outside_region_iii")
        municipality = MUNICIPALITY_LOOKUP[province].get(normalize_location(value.get("municipality")))
        if not municipality:
            raise ValueError("scope_municipality_province_mismatch")
        key = (normalize_location(province), normalize_location(municipality))
        if key in seen:
            raise ValueError("duplicate_scope_location")
        seen.add(key)
        output.append({"province": province, "municipality": municipality})
    return output


def legacy_scope_locations(values: Any) -> list[dict[str, str]]:
    if not isinstance(values, list):
        return []
    candidates: dict[str, list[dict[str, str]]] = {}
    for province, municipalities in REGION3_LOCATIONS.items():
        for municipality in municipalities:
            candidates.setdefault(normalize_location(municipality), []).append({
                "province": province,
                "municipality": municipality,
            })
    output: list[dict[str, str]] = []
    for value in values:
        matches = candidates.get(normalize_location(value), [])
        if len(matches) == 1 and matches[0] not in output:
            output.append(matches[0])
    return output


def policy_locations(policy: dict[str, Any]) -> list[dict[str, str]]:
    locations = policy.get("locations")
    if isinstance(locations, list):
        try:
            return canonicalize_scope_locations(locations)
        except ValueError:
            return []
    return legacy_scope_locations(policy.get("municipalities"))
