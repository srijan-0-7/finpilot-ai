"""
Metadata store for everything that isn't the user's actual uploaded
business data: query history, shareable snapshots, uploaded-table tracking,
dashboard column-mappings, user-defined table relationships, and
authentication (users + sessions).

Kept in a separate SQLite file (metadata.db) so it never mixes with any
account's real business data (data/users/<user_id>.db) or gets wiped when
that gets re-seeded/re-uploaded.

Per-user isolation: query_history, uploaded_tables, table_relationships,
and dashboard_configs are all scoped by user_id — every read/write function
below takes a user_id and filters/stores by it, so one account's rows are
never visible to, or deletable by, another account. (shared_results is
intentionally NOT user-scoped: it's the payload behind public "share a
result" links, which are meant to be viewable by anyone with the link,
logged in or not.)
"""
import sqlite3
import json
import uuid
import time
import shutil
import secrets
from pathlib import Path
from contextlib import contextmanager

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
METADATA_DB_PATH = str(PROJECT_ROOT / "data" / "metadata.db")

SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30  # 30 days
DEMO_EMAIL = "demo@finpilot.local"


@contextmanager
def get_conn():
    conn = sqlite3.connect(METADATA_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _column_exists(conn, table: str, column: str) -> bool:
    return column in [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def _get_or_create_demo_user_id(conn) -> str:
    row = conn.execute("SELECT id FROM users WHERE email = ?", (DEMO_EMAIL,)).fetchone()
    if row:
        return row["id"]
    user_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO users (id, email, password_hash, is_demo, created_at) VALUES (?, ?, ?, 1, ?)",
        (user_id, DEMO_EMAIL, "", time.time()),
    )
    return user_id


def _migrate_legacy_shared_data(conn):
    """
    One-time migration for databases created before per-user data isolation
    existed. Back then, uploaded_tables/table_relationships/dashboard_configs/
    query_history had no owner at all — every account read and wrote the
    same rows. This detects that old shape (no user_id column yet) and:

      1. Reassigns all pre-existing rows to the shared demo account, so nothing
         silently disappears out from under whoever was using the app.
      2. Rebuilds uploaded_tables and dashboard_configs with user_id as part
         of the primary key (table names can now collide safely across
         accounts, since each account's tables live in their own database
         file — see core/config.py's get_user_db_url).
      3. Copies the old shared business-data file (data/finpilot.db), if one
         exists, into the demo account's new isolated file, so old data is
         still there under a demo login instead of orphaned.

    Safe to call on every startup: it's a no-op once the user_id column
    already exists.
    """
    if not _column_exists(conn, "uploaded_tables", "table_name") or _column_exists(conn, "uploaded_tables", "user_id"):
        return  # either a brand-new db (nothing to migrate) or already migrated

    demo_user_id = _get_or_create_demo_user_id(conn)

    conn.execute("ALTER TABLE uploaded_tables RENAME TO uploaded_tables_legacy")
    conn.execute("""
        CREATE TABLE uploaded_tables (
            user_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            original_filename TEXT,
            dashboard_eligible INTEGER DEFAULT 1,
            ineligible_reason TEXT,
            created_at REAL NOT NULL,
            PRIMARY KEY (user_id, table_name)
        )
    """)
    conn.execute("""
        INSERT INTO uploaded_tables (user_id, table_name, original_filename, dashboard_eligible, ineligible_reason, created_at)
        SELECT ?, table_name, original_filename, dashboard_eligible, ineligible_reason, created_at FROM uploaded_tables_legacy
    """, (demo_user_id,))
    conn.execute("DROP TABLE uploaded_tables_legacy")

    conn.execute("ALTER TABLE table_relationships ADD COLUMN user_id TEXT")
    conn.execute("UPDATE table_relationships SET user_id = ? WHERE user_id IS NULL", (demo_user_id,))

    conn.execute("ALTER TABLE dashboard_configs RENAME TO dashboard_configs_legacy")
    conn.execute("""
        CREATE TABLE dashboard_configs (
            user_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            date_col TEXT,
            amount_col TEXT,
            category_col TEXT,
            entity_col TEXT,
            label TEXT,
            is_active INTEGER DEFAULT 0,
            created_at REAL NOT NULL,
            PRIMARY KEY (user_id, table_name)
        )
    """)
    conn.execute("""
        INSERT INTO dashboard_configs (user_id, table_name, date_col, amount_col, category_col, entity_col, label, is_active, created_at)
        SELECT ?, table_name, date_col, amount_col, category_col, entity_col, label, is_active, created_at FROM dashboard_configs_legacy
    """, (demo_user_id,))
    conn.execute("DROP TABLE dashboard_configs_legacy")

    conn.execute("ALTER TABLE query_history ADD COLUMN user_id TEXT")
    conn.execute("UPDATE query_history SET user_id = ? WHERE user_id IS NULL", (demo_user_id,))

    legacy_business_db = PROJECT_ROOT / "data" / "finpilot.db"
    new_demo_db = PROJECT_ROOT / "data" / "users" / f"{demo_user_id}.db"
    if legacy_business_db.exists() and not new_demo_db.exists():
        new_demo_db.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy_business_db, new_demo_db)


def get_or_create_demo_user_id() -> str:
    """Public helper for scripts (e.g. seed_app_db.py) that need to attach
    data to the shared demo account before anyone has logged in via the
    demo-key flow yet."""
    with get_conn() as conn:
        return _get_or_create_demo_user_id(conn)


def init_metadata_db():
    Path(METADATA_DB_PATH).parent.mkdir(exist_ok=True)
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS query_history (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                query TEXT NOT NULL,
                sql TEXT,
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS shared_results (
                id TEXT PRIMARY KEY,
                title TEXT,
                payload TEXT NOT NULL,
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS uploaded_tables (
                user_id TEXT NOT NULL,
                table_name TEXT NOT NULL,
                original_filename TEXT,
                dashboard_eligible INTEGER DEFAULT 1,
                ineligible_reason TEXT,
                created_at REAL NOT NULL,
                PRIMARY KEY (user_id, table_name)
            );

            CREATE TABLE IF NOT EXISTS table_relationships (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                table_a TEXT NOT NULL,
                column_a TEXT NOT NULL,
                table_b TEXT NOT NULL,
                column_b TEXT NOT NULL,
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dashboard_configs (
                user_id TEXT NOT NULL,
                table_name TEXT NOT NULL,
                date_col TEXT,
                amount_col TEXT,
                category_col TEXT,
                entity_col TEXT,
                label TEXT,
                is_active INTEGER DEFAULT 0,
                created_at REAL NOT NULL,
                PRIMARY KEY (user_id, table_name)
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_demo INTEGER DEFAULT 0,
                created_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS demo_access_keys (
                key TEXT PRIMARY KEY,
                created_at REAL NOT NULL,
                use_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS page_views (
                id TEXT PRIMARY KEY,
                ip_hash TEXT,
                user_agent TEXT,
                created_at REAL NOT NULL
            );
        """)
        _migrate_legacy_shared_data(conn)


# --- Query history ---

def add_history(user_id: str, query: str, sql: str) -> str:
    entry_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO query_history (id, user_id, query, sql, created_at) VALUES (?, ?, ?, ?, ?)",
            (entry_id, user_id, query, sql, time.time()),
        )
    return entry_id


def list_history(user_id: str, limit: int = 50):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, query, sql, created_at FROM query_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def clear_history(user_id: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM query_history WHERE user_id = ?", (user_id,))


# --- Shared results ---

def create_share(title: str, payload: dict) -> str:
    share_id = str(uuid.uuid4())[:8]
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO shared_results (id, title, payload, created_at) VALUES (?, ?, ?, ?)",
            (share_id, title, json.dumps(payload), time.time()),
        )
    return share_id


def get_share(share_id: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, title, payload, created_at FROM shared_results WHERE id = ?",
            (share_id,),
        ).fetchone()
        if not row:
            return None
        result = dict(row)
        result["payload"] = json.loads(result["payload"])
        return result


# --- Uploaded table tracking ---

def register_uploaded_table(user_id: str, table_name: str, original_filename: str, dashboard_eligible: bool = True, ineligible_reason: str = None):
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO uploaded_tables (user_id, table_name, original_filename, dashboard_eligible, ineligible_reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, table_name, original_filename, 1 if dashboard_eligible else 0, ineligible_reason, time.time()),
        )


def list_uploaded_tables(user_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT table_name, original_filename, dashboard_eligible, ineligible_reason, created_at "
            "FROM uploaded_tables WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def unregister_uploaded_table(user_id: str, table_name: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM uploaded_tables WHERE user_id = ? AND table_name = ?", (user_id, table_name))


# --- Table relationships (user-defined FKs for tables that don't have real DB-level FKs) ---

def add_relationship(user_id: str, table_a: str, column_a: str, table_b: str, column_b: str) -> str:
    rel_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO table_relationships (id, user_id, table_a, column_a, table_b, column_b, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (rel_id, user_id, table_a, column_a, table_b, column_b, time.time()),
        )
    return rel_id


def list_relationships(user_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, table_a, column_a, table_b, column_b FROM table_relationships WHERE user_id = ? ORDER BY created_at",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def delete_relationship(user_id: str, rel_id: str):
    # Scoped by user_id too, not just id — otherwise one account could
    # delete another account's relationship just by guessing/enumerating ids.
    with get_conn() as conn:
        conn.execute("DELETE FROM table_relationships WHERE id = ? AND user_id = ?", (rel_id, user_id))


def delete_relationships_for_table(user_id: str, table_name: str):
    """Called when a table is dropped, so stale relationships don't linger."""
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM table_relationships WHERE user_id = ? AND (table_a = ? OR table_b = ?)",
            (user_id, table_name, table_name),
        )


# --- Dashboard column-mapping config ---

def save_dashboard_config(user_id: str, table_name: str, date_col: str, amount_col: str, category_col: str, entity_col: str, label: str, make_active: bool = True):
    with get_conn() as conn:
        if make_active:
            conn.execute("UPDATE dashboard_configs SET is_active = 0 WHERE user_id = ?", (user_id,))
        conn.execute(
            """INSERT OR REPLACE INTO dashboard_configs
               (user_id, table_name, date_col, amount_col, category_col, entity_col, label, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, table_name, date_col, amount_col, category_col, entity_col, label, 1 if make_active else 0, time.time()),
        )


def get_active_dashboard_config(user_id: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM dashboard_configs WHERE user_id = ? AND is_active = 1 LIMIT 1", (user_id,)
        ).fetchone()
        return dict(row) if row else None


def list_dashboard_configs(user_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM dashboard_configs WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def delete_dashboard_config(user_id: str, table_name: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM dashboard_configs WHERE user_id = ? AND table_name = ?", (user_id, table_name))


# --- Auth: users + sessions ---

def create_user(email: str, password_hash: str, is_demo: bool = False) -> str:
    user_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO users (id, email, password_hash, is_demo, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, email.lower().strip(), password_hash, 1 if is_demo else 0, time.time()),
        )
    return user_id


def get_user_by_email(email: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower().strip(),)).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def update_user_password(user_id: str, new_password_hash: str):
    with get_conn() as conn:
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_password_hash, user_id))


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now, now + SESSION_LIFETIME_SECONDS),
        )
    return token


def get_session_user(token: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT s.user_id, s.expires_at, u.email, u.is_demo FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?",
            (token,),
        ).fetchone()
        if not row:
            return None
        if row["expires_at"] < time.time():
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            return None
        return dict(row)


def delete_session(token: str):
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


# --- Demo access keys (for sharing with friends/LinkedIn without a full signup) ---

def create_demo_access_key() -> str:
    key = secrets.token_urlsafe(9)  # short, easy to paste/share
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO demo_access_keys (key, created_at, use_count) VALUES (?, ?, 0)",
            (key, time.time()),
        )
    return key


def validate_and_use_demo_key(key: str) -> bool:
    with get_conn() as conn:
        row = conn.execute("SELECT key FROM demo_access_keys WHERE key = ?", (key,)).fetchone()
        if not row:
            return False
        conn.execute("UPDATE demo_access_keys SET use_count = use_count + 1 WHERE key = ?", (key,))
        return True


def list_demo_access_keys():
    with get_conn() as conn:
        rows = conn.execute("SELECT key, created_at, use_count FROM demo_access_keys ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


# --- Visit tracking (for "how many people used my app") ---

def record_page_view(ip_hash: str, user_agent: str):
    view_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO page_views (id, ip_hash, user_agent, created_at) VALUES (?, ?, ?, ?)",
            (view_id, ip_hash, user_agent, time.time()),
        )


def get_admin_stats():
    with get_conn() as conn:
        total_views = conn.execute("SELECT COUNT(*) FROM page_views").fetchone()[0]
        unique_visitors = conn.execute("SELECT COUNT(DISTINCT ip_hash) FROM page_views").fetchone()[0]
        total_users = conn.execute("SELECT COUNT(*) FROM users WHERE is_demo = 0").fetchone()[0]
        total_sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]

        # Views per day for the last 14 days (SQLite date() on a unix timestamp)
        views_by_day = conn.execute("""
            SELECT date(created_at, 'unixepoch') as day, COUNT(*) as views
            FROM page_views
            WHERE created_at > ?
            GROUP BY day
            ORDER BY day
        """, (time.time() - 14 * 86400,)).fetchall()

        recent_signups = conn.execute("""
            SELECT email, created_at FROM users WHERE is_demo = 0 ORDER BY created_at DESC LIMIT 10
        """).fetchall()

        demo_keys = conn.execute(
            "SELECT key, created_at, use_count FROM demo_access_keys ORDER BY created_at DESC"
        ).fetchall()

    return {
        "total_page_views": total_views,
        "unique_visitors": unique_visitors,
        "total_registered_users": total_users,
        "total_sessions_ever": total_sessions,
        "views_by_day": [dict(r) for r in views_by_day],
        "recent_signups": [dict(r) for r in recent_signups],
        "demo_keys": [dict(r) for r in demo_keys],
    }
