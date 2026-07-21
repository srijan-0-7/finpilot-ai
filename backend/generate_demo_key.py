"""
Generates a demo access key — share this with friends, or put it in a
LinkedIn post, so people can try the app without creating a full account.

Usage (from the project root):
    python -m backend.generate_demo_key

On Render: open the Shell tab for your service and run the same command.

Each key can be used any number of times (there's no per-use limit), but
you can generate as many separate keys as you want and track usage counts
with `python -m backend.list_demo_keys`.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.services import metadata_store


def main():
    metadata_store.init_metadata_db()
    key = metadata_store.create_demo_access_key()
    print("=" * 60)
    print("Demo access key created:")
    print(f"\n    {key}\n")
    print("Share this with anyone who wants to try the app — they can")
    print("enter it on the login page instead of creating an account.")
    print("=" * 60)


if __name__ == "__main__":
    main()
