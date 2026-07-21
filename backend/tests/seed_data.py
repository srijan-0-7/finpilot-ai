import sqlite3
import os
from pathlib import Path

# Absolute path to <project_root>/data/finpilot_test.db, regardless of cwd
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = str(PROJECT_ROOT / "data" / "finpilot_test.db")

def seed_database():
    # Ensure clean slate
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create Schema
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

    # Insert deterministic test data
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
    
    conn.commit()
    conn.close()
    print(f"Test database seeded successfully at {DB_PATH}")

if __name__ == "__main__":
    seed_database()