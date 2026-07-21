"""
One-command launcher for FinPilot AI.

Usage (from the project root, after installing requirements and setting
backend/.env):

    python run.py

This will:
  1. Seed the app database if it doesn't exist yet.
  2. Start the server, which serves BOTH the API and the pre-built
     frontend (frontend/dist).

Locally, just open http://localhost:8000 afterwards. On a host like
Render/Railway, the PORT environment variable is set automatically and
this respects it.
"""
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

DB_PATH = PROJECT_ROOT / "data" / "finpilot.db"
ENV_PATH = PROJECT_ROOT / "backend" / ".env"


def main():
    # AI_API_KEY can come from either backend/.env (local dev) or a real
    # environment variable set by your host (Render, Railway, etc.) — so we
    # check both rather than hard-requiring the .env file to exist.
    has_env_file = ENV_PATH.exists()
    has_env_var = bool(os.environ.get("AI_API_KEY"))

    if not has_env_file and not has_env_var:
        print("=" * 70)
        print("ERROR: No AI_API_KEY found (checked backend/.env and environment variables).")
        print("For local use, run this first:")
        print("    cp backend/.env.example backend/.env")
        print("Then open backend/.env and paste your free Groq API key.")
        print("(Get one at https://console.groq.com/keys)")
        print("=" * 70)
        sys.exit(1)

    if not DB_PATH.exists():
        print("No app database found yet — seeding one now...")
        from backend.seed_app_db import seed_database
        seed_database()

    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"\nStarting FinPilot AI on port {port}  (Ctrl+C to stop)\n")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
