"""Shared helpers used by the e-pharmacy search provider (google_cse.py) —
pure text utilities with no network calls.
"""
import re

_STRIP_SUFFIXES = re.compile(
    r"\b(\d+[\.,]?\d*\s*(mg|ml|mcg|iu|gm|g|%)|"
    r"tablet|tablets|capsule|capsules|syrup|injection|injections|solution|cream|gel|ointment|"
    r"drops|inhaler|spray|suspension|powder|sachet|sachets|strip|bottle|bottles|"
    r"pack|box|pc|pcs|dt|sr|er|cr|xl|of \d+)\b.*$",
    re.IGNORECASE,
)


def clean_brand_name(name: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", name.upper())


def generate_composition_key(composition: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", composition.upper())


def clean_brand_stub(raw_title: str) -> str:
    """Reduces an indexed page title (e.g. "Buy Dolo 650 Tablet 15's Online
    at Best Price in India - 1mg") down to the brand name itself."""
    if not raw_title:
        return ""
    for prefix in ("Buy ", "Order "):
        if raw_title.startswith(prefix):
            raw_title = raw_title[len(prefix):].strip()
    for sep in (" - ", " | ", " : ", " – ", " — "):
        if sep in raw_title:
            raw_title = raw_title.split(sep)[0]
    stub = _STRIP_SUFFIXES.sub("", raw_title).strip(" -'\",./")
    return stub or raw_title
