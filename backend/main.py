import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.core.config import get_settings
from backend.core.rate_limiter import limiter
from backend.api.routes import router as api_router
from backend.services import metadata_store

settings = get_settings()
IS_PRODUCTION = settings.ENVIRONMENT.lower() == "production"

metadata_store.init_metadata_db()

# In production, hide the interactive API docs (/docs, /redoc, /openapi.json).
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

# --- Rate limiting ---
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- CORS ---
allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
if settings.EXTRA_CORS_ORIGINS:
    allowed_origins += [o.strip() for o in settings.EXTRA_CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Security headers ---
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


# --- Authentication ---
# Real accounts (signup/login) plus a demo-key flow, replacing the old
# single shared password. Every /api/v1/* route except /health and the
# /auth/* endpoints themselves requires a valid session token in the
# Authorization header ("Bearer <token>").
#
# Every account gets its own session AND its own isolated business-data
# database file (see core/config.py's get_user_db_url and
# api/routes.py's _get_user_services) — uploads, drops, dashboards, and
# history for one account are never visible to, or affected by, another.
# The shared demo account is the one intentional exception: every demo-key
# login resolves to the same demo user_id, so demo visitors share one
# sandbox by design, isolated from every real account.
PUBLIC_PATHS = {
    f"{settings.API_V1_STR}/health",
    f"{settings.API_V1_STR}/auth/signup",
    f"{settings.API_V1_STR}/auth/login",
    f"{settings.API_V1_STR}/auth/demo-login",
    f"{settings.API_V1_STR}/track-visit",
    f"{settings.API_V1_STR}/admin/stats",
}


@app.middleware("http")
async def check_auth(request: Request, call_next):
    if request.url.path.startswith(settings.API_V1_STR) and request.url.path not in PUBLIC_PATHS:
        auth_header = request.headers.get("Authorization", "")
        token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
        user = metadata_store.get_session_user(token) if token else None
        if not user:
            return JSONResponse(status_code=401, content={"detail": "Not logged in, or your session has expired."})
        request.state.user = user
    return await call_next(request)


app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get(f"{settings.API_V1_STR}/health")
async def health():
    return {"status": "ok", "service": settings.PROJECT_NAME}


# Serve the pre-built frontend (frontend/dist) so the whole app runs from
# this single FastAPI process.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
