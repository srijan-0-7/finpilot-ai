"""
Lists all demo access keys and how many times each has been used.

Usage (from the project root):
    python -m backend.list_demo_keys
"""
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.services import metadata_store


def main():
    metadata_store.init_metadata_db()
    keys = metadata_store.list_demo_access_keys()
    if not keys:
        print("No demo access keys yet. Create one with: python -m backend.generate_demo_key")
        return

    print(f"{'Key':<15} {'Created':<20} {'Uses'}")
    print("-" * 45)
    for k in keys:
        created = datetime.fromtimestamp(k["created_at"]).strftime("%Y-%m-%d %H:%M")
        print(f"{k['key']:<15} {created:<20} {k['use_count']}")


if __name__ == "__main__":
    main()
