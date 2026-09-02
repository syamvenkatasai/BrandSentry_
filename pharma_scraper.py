"""Dispatches e-pharmacy discovery (1mg / PharmEasy / Apollo Pharmacy /
Netmeds) to app.services.search_providers.google_cse (Google Custom Search
JSON API, one siteSearch-scoped query per domain).

Same public interface as every prior version of this module
(clean_brand_name, generate_composition_key, scrape_sources_async), so every
caller (app.services.market_check, and transitively brand_screening.py /
generator.py) works unmodified — this file is the ONLY thing that changes if
the underlying e-pharmacy discovery provider ever changes again; nothing
downstream needs to know or care which provider answered.
"""
import logging
from typing import Any, Dict, List

from app.services.search_providers import google_cse
from app.services.search_providers.common import clean_brand_name, generate_composition_key  # noqa: F401

logger = logging.getLogger(__name__)


async def scrape_sources_async(composition: str) -> List[Dict[str, Any]]:
    logger.info("Executing e-pharmacy discovery using engine: %s", google_cse.__name__)
    return await google_cse.scrape_sources_async(composition)
