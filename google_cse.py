"""Google Custom Search-based discovery of Indian e-pharmacy listings (1mg,
PharmEasy, Apollo Pharmacy, Netmeds), queried by composition or brand name.

Dispatched to by app.services.pharma_scraper. E-pharmacy platforms are
reached through the Google Programmable Search API (Custom Search JSON API),
scoped to each site with the `siteSearch` parameter.

Requires GOOGLE_API_KEY + GOOGLE_CSE_ID (a Programmable Search Engine set to
search the entire web — `siteSearch` restricts an individual query to one
domain regardless of the engine's own configured scope). Returns [] when
unconfigured or on any API error — callers already treat an empty result as
"not checked", never as "confirmed clean" (see market_check.py).
"""
import asyncio
import logging
from typing import Any, Dict, List

import httpx

from app.core.config import settings
from app.services.search_providers.common import clean_brand_name, clean_brand_stub, generate_composition_key

logger = logging.getLogger(__name__)

GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1"
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
# First page of results only per site — mirrors the 1-page-of-results
# semantics of the general Google web-search check (app.services.web_search),
# and keeps total latency bounded since all four sites are queried
# concurrently.
_RESULTS_PER_SITE = 10

_PHARMACY_SITES = (
    ("1mg.com", "1mg"),
    ("pharmeasy.in", "PharmEasy"),
    ("apollopharmacy.in", "Apollo Pharmacy"),
    ("netmeds.com", "Netmeds"),
)


async def _search_site(
    client: httpx.AsyncClient, query: str, site_domain: str, site_name: str,
) -> List[Dict[str, Any]]:
    """Up to one page of Google Custom Search results restricted to
    `site_domain` via the siteSearch param (works even when the configured
    Programmable Search Engine itself is scoped to the whole web)."""
    try:
        response = await client.get(GOOGLE_CSE_URL, params={
            "key": settings.GOOGLE_API_KEY,
            "cx": settings.GOOGLE_CSE_ID,
            "q": query,
            "siteSearch": site_domain,
            "siteSearchFilter": "i",
            "num": _RESULTS_PER_SITE,
        })
        if response.status_code != 200:
            logger.warning("[%s] Google CSE returned %s for query %r", site_name, response.status_code, query)
            return []
        items = response.json().get("items", [])
        logger.info("[%s] Google CSE returned %d listing(s) for query %r", site_name, len(items), query)
        return [{"title": item.get("title", ""), "link": item.get("link", ""), "source": site_name} for item in items]
    except Exception:
        logger.exception("[%s] Google CSE site-search failed for query %r", site_name, query)
        return []


async def scrape_sources_async(composition: str) -> List[Dict[str, Any]]:
    logger.info(
        "Querying Google Custom Search (site-restricted to 1mg, PharmEasy, Apollo Pharmacy, "
        "and Netmeds) for: '%s'", composition,
    )
    comp_key = generate_composition_key(composition)
    brands_dict: Dict[str, dict] = {}

    if not settings.GOOGLE_API_KEY or not settings.GOOGLE_CSE_ID:
        logger.warning(
            "GOOGLE_API_KEY / GOOGLE_CSE_ID not configured — e-pharmacy check "
            "skipped (treated as 'not checked', never as 'confirmed clean')."
        )
        return []

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        batches = await asyncio.gather(*(
            _search_site(client, composition, domain, name) for domain, name in _PHARMACY_SITES
        ))

    for batch in batches:
        for item in batch:
            clean_brand = clean_brand_stub(item["title"])
            if not clean_brand or len(clean_brand) < 2:
                continue
            key = clean_brand.upper()
            if key not in brands_dict:
                brands_dict[key] = {
                    "brand_name": clean_brand,
                    "manufacturer": "Unknown",
                    "source": item["source"],
                    "link": item.get("link"),
                }
            elif item["source"] not in brands_dict[key]["source"]:
                brands_dict[key]["source"] += f", {item['source']}"

    results = [
        {
            "brand_name": details["brand_name"],
            "brand_name_clean": clean_brand_name(details["brand_name"]),
            "composition_scraped": "Unknown",
            "manufacturer": details["manufacturer"],
            "composition_key": comp_key,
            "source": details["source"],
        }
        for details in brands_dict.values()
    ]

    logger.info("================================================================================")
    logger.info(
        "GOOGLE CUSTOM SEARCH E-PHARMACY CHECK COMPLETE: %d distinct brand name(s) found for '%s':",
        len(results), composition,
    )
    for idx, item in enumerate(results[:25], 1):
        logger.info("  [%02d] Brand: %-30s | Mfr: %-25s | Source: %s", idx, item["brand_name"][:30], (item.get("manufacturer") or "Unknown")[:25], item["source"])
    if len(results) > 25:
        logger.info("  ... and %d more brand names captured into market collision pool", len(results) - 25)
    logger.info("================================================================================")
    return results
