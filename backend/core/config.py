import re
from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path

# Absolute path to the project's /data folder, regardless of which directory
# uvicorn/pytest is launched from.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

# Each account (including the shared demo account) gets its own SQLite file
# under here, e.g. data/users/<user_id>.db. This is what makes uploads and
# drops for one account invisible to every other account — there is no
# single shared business-data file anymore.
USER_DATA_DIR = DATA_DIR / "users"
USER_DATA_DIR.mkdir(exist_ok=True)

_SAFE_ID_RE = re.compile(r"[^a-zA-Z0-9_-]")


class Settings(BaseSettings):
    PROJECT_NAME: str = "FinPilot AI API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Legacy single shared database path. No longer used to serve requests
    # (see get_user_db_url below) — kept only so one-time migration code can
    # find and copy forward any pre-existing shared data.
    DATABASE_URL: str = f"sqlite:///{DATA_DIR / 'finpilot.db'}"

    def get_user_db_url(self, user_id: str) -> str:
        """
        Returns the SQLite URL for this specific account's business-data
        database (uploaded tables live here). Every request must go through
        this instead of the old shared DATABASE_URL constant, or isolation
        breaks straight back to "everyone shares one database".
        """
        safe_id = _SAFE_ID_RE.sub("_", user_id)
        db_path = USER_DATA_DIR / f"{safe_id}.db"
        return f"sqlite:///{db_path}"
    
    # AI Provider (using Groq's free, OpenAI-compatible API)
    AI_API_KEY: str
    AI_BASE_URL: str = "https://api.groq.com/openai/v1"
    AI_MODEL: str = "llama-3.3-70b-versatile"
    
    # Security
    ALLOW_DATA_MODIFICATION: bool = False

    # Deployment
    ENVIRONMENT: str = "development"  # set to "production" on your host
    PORT: int = 8000  # most hosts (Render, Railway, etc.) inject their own via $PORT

    # Comma-separated list of extra allowed origins for CORS, e.g. your
    # deployed frontend URL if it's ever hosted separately from the API.
    # Same-origin requests (the normal case here, since FastAPI serves the
    # built frontend directly) don't need this at all.
    EXTRA_CORS_ORIGINS: str = ""

    # Protects the /admin/stats endpoint (visit counts, signup counts, etc).
    # Set this to something private once deployed — without it set, the
    # admin stats endpoint is unreachable (fails closed, not open).
    ADMIN_KEY: str = ""

    class Config:
        # Absolute path so this loads correctly no matter which directory
        # you launch uvicorn/pytest from.
        env_file = str(Path(__file__).resolve().parent.parent / ".env")

@lru_cache()
def get_settings():
    return Settings()