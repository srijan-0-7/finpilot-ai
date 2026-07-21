"""
Seeds the REAL database that the running app (main.py) queries against,
with example data — clearly meant to be replaced. This also:

1. Creates a denormalized VIEW joining the three example tables into one
   flat table shape (one row per transaction, with region/product already
   joined in), and
2. Registers that view as the default active dashboard config, via the
   exact same config mechanism any user-uploaded CSV goes through
   (backend/services/metadata_store.py's dashboard_configs table).

This means the dashboard has no special-cased "demo mode" — the example
data is just the first dashboard config, and uploading your own CSV and
mapping its columns naturally replaces it.

Run from the project root with:
    python -m backend.seed_app_db
"""
import sqlite3
import os
from backend.core.config import get_settings
from backend.services import metadata_store

settings = get_settings()


def seed_database():
    # Every account (including the shared demo account) has its own isolated
    # database file — see core/config.py's get_user_db_url. This ensures the
    # demo account exists first, then seeds *its* file specifically, rather
    # than a single shared finpilot.db that every account used to read.
    metadata_store.init_metadata_db()
    demo_user_id = metadata_store.get_or_create_demo_user_id()
    db_path = settings.get_user_db_url(demo_user_id).replace("sqlite:///", "")

    if os.path.exists(db_path):
        os.remove(db_path)

    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE customers (
            customer_id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            region TEXT NOT NULL,
            signup_date DATE
        );

        CREATE TABLE products (
            product_id INTEGER PRIMARY KEY,
            product_name TEXT NOT NULL,
            category TEXT,
            price DECIMAL(10, 2)
        );

        CREATE TABLE transactions (
            transaction_id INTEGER PRIMARY KEY,
            customer_id INTEGER,
            product_id INTEGER,
            amount DECIMAL(10, 2),
            transaction_date DATE,
            FOREIGN KEY(customer_id) REFERENCES customers(customer_id),
            FOREIGN KEY(product_id) REFERENCES products(product_id)
        );
    """)

    cursor.executescript("""
        INSERT INTO customers VALUES
        (1, 'Acme Corp', 'North America', '2023-01-15'),
        (2, 'Globex', 'Europe', '2023-03-22'),
        (3, 'Initech', 'North America', '2023-06-10');

        INSERT INTO products VALUES
        (1, 'Enterprise License', 'Software', 5000.00),
        (2, 'Cloud Storage 1TB', 'Infrastructure', 200.00);

        INSERT INTO transactions VALUES
        (1, 1, 1, 5000.00, '2023-01-20'),
        (2, 1, 2, 200.00, '2023-02-15'),
        (3, 2, 1, 5000.00, '2023-04-01'),
        (4, 3, 2, 200.00, '2023-06-15'),
        (5, 3, 2, 200.00, '2023-07-15');
    """)

    # Denormalized view: one flat row per transaction, region/product already
    # joined in. This is what lets the demo data plug into the exact same
    # generic, config-driven dashboard/report engine as any user upload.
    cursor.executescript("""
        CREATE VIEW example_sales_flat AS
        SELECT
            t.transaction_id,
            t.transaction_date,
            t.amount,
            c.region,
            c.name AS customer_name,
            p.product_name
        FROM transactions t
        JOIN customers c ON t.customer_id = c.customer_id
        JOIN products p ON t.product_id = p.product_id;
    """)

    conn.commit()
    conn.close()

    # Register the example view as the default dashboard config for the demo
    # account — using the same mechanism a real user's uploaded CSV would go
    # through, not a special case.
    metadata_store.save_dashboard_config(
        user_id=demo_user_id,
        table_name="example_sales_flat",
        date_col="transaction_date",
        amount_col="amount",
        category_col="region",
        entity_col="product_name",
        label="Example Sales Data (replace me!)",
        make_active=True,
    )

    print(f"Demo account database seeded successfully at {db_path}")


if __name__ == "__main__":
    seed_database()
