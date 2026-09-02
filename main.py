from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import (
    load_settings_from_parameter_store,
    settings,
    validate_required_settings,
)
from app.core.logging_config import configure_logging

# Ordering here is load-bearing, not stylistic — everything below must run
# before the routes/database imports further down:
#   1. configure_logging() first — anything that logs at import time (e.g.
#      app.services.ai's module-level AIService() instantiation warns if no
#      LLM key is configured) would otherwise have that first message
#      silently dropped by Python's unconfigured default logging setup.
#   2. Then load_settings_from_parameter_store() — must land BEFORE
#      app.core.database and app.services.ai are ever imported: both read
#      settings (DATABASE_URL, SPIL_AI_BRANDSENTRY_* etc.) at IMPORT TIME to
#      build a module-level engine/client, so an override arriving any later
#      (e.g. from inside the FastAPI startup event below, which runs after
#      this whole import chain completes) would be too late to matter.
#   3. Then validate_required_settings() — SECRET_KEY has no safe default
#      (see config.py), so this fails startup loudly if neither .env nor the
#      SSM call above actually supplied it, rather than letting the app boot
#      with a missing JWT secret.
configure_logging(settings.LOG_LEVEL)
load_settings_from_parameter_store()
validate_required_settings()

import logging  # noqa: E402

from app.api.routes import (  # noqa: E402
    admin,
    audit,
    auth,
    brands,
    cart,
    dashboard,
    legal,
    notifications,
    reference_data,
    reports,
    settings as platform_settings,
    suggestion,
)
from app.core.database import create_tables  # noqa: E402

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="BrandSentry Platform API",
    docs_url="/docs",
    redoc_url="/redoc",
)

_allowed_origins = {
    origin.strip()
    for origin in (settings.FRONTEND_URL or "").split(",")
    if origin.strip()
}
if settings.CORS_ORIGINS:
    _allowed_origins.update({
        origin.strip()
        for origin in settings.CORS_ORIGINS.split(",")
        if origin.strip()
    })

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_allowed_origins),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(suggestion.router)
app.include_router(brands.router)
app.include_router(reference_data.router)
app.include_router(legal.router)
app.include_router(cart.router)
app.include_router(admin.router)
app.include_router(audit.router)
app.include_router(platform_settings.router)
app.include_router(dashboard.router)
app.include_router(notifications.router)
app.include_router(reports.router)


@app.on_event("startup")
def startup():
    create_tables()
    logger.info("%s v%s started (log level %s)", settings.APP_NAME, settings.VERSION, settings.LOG_LEVEL)


@app.get("/health")
def health():
    return {"status": "healthy", "version": settings.VERSION}
