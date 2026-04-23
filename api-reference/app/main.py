"""
PQSafe API Reference Server — main entry point.

FastAPI application that exposes PQSafe envelope signing + rail routing as a
hosted HTTP API.  This is the reference implementation for api.pqsafe.xyz.

Design partners who prefer "PQSafe as a service" over self-hosting the SDK
can point their agents at this server instead.
"""

from __future__ import annotations

import logging
import sys
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from app.crypto.envelope import active_backend
from app.routers import auth, envelopes, pay, rails
from app.settings import settings

# ---------------------------------------------------------------------------
# Structured logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    stream=sys.stdout,
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("pqsafe.api")


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "PQSafe API starting — crypto_backend=%s mock_mode=%s airwallex_mode=%s",
        active_backend(),
        settings.mock_mode,
        settings.airwallex_mode,
    )
    yield
    logger.info("PQSafe API shutting down")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="PQSafe AgentPay API",
    description=(
        "Post-quantum safe payments for AI agents. "
        "Exposes envelope signing + rail routing as a hosted HTTP API. "
        "Reference implementation for api.pqsafe.xyz."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS — allow all origins by default (configure per deployment)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics at /metrics
Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    excluded_handlers=["/health", "/metrics"],
).instrument(app).expose(app)

# Routers
app.include_router(auth.router)
app.include_router(envelopes.router)
app.include_router(pay.router)
app.include_router(rails.router)


# ---------------------------------------------------------------------------
# Core endpoints
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"], summary="Health check")
async def health() -> dict[str, str]:
    """Returns 200 OK when the server is ready to serve requests."""
    return {"status": "ok"}


@app.get("/version", tags=["system"], summary="Server version + crypto backend")
async def version() -> dict[str, str]:
    """Returns the API version, crypto backend in use, and mock mode status."""
    return {
        "version": "0.1.0",
        "crypto_backend": active_backend(),
        "mock_mode": str(settings.mock_mode),
        "airwallex_mode": settings.airwallex_mode,
    }


# ---------------------------------------------------------------------------
# Global error handler — return consistent JSON on unhandled exceptions
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )
