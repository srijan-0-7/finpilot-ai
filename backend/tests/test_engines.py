import pytest
import pandas as pd
from fastapi import HTTPException
from backend.services.sql_validator import SQLValidator
from backend.services.query_engine import QueryEngine
from backend.services.excel_exporter import ExcelExporter

from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TEST_DB_URL = f"sqlite:///{PROJECT_ROOT / 'data' / 'finpilot_test.db'}"

# --- 1. SQL Validator Tests ---

def test_sql_validator_safe_query():
    # Should pass silently
    assert SQLValidator.validate_query("SELECT * FROM transactions WHERE amount > 1000") == True
    assert SQLValidator.validate_query("WITH top_cust AS (SELECT * FROM customers) SELECT * FROM top_cust") == True

def test_sql_validator_rejects_destructive_query():
    # Should raise HTTP 403 Forbidden
    with pytest.raises(HTTPException) as excinfo:
        SQLValidator.validate_query("DROP TABLE transactions;")
    assert excinfo.value.status_code == 403

    with pytest.raises(HTTPException):
        SQLValidator.validate_query("SELECT * FROM customers; DELETE FROM transactions;")

# --- 2. Query Engine Tests (Against Seeded Data) ---

@pytest.fixture
def query_engine():
    return QueryEngine(TEST_DB_URL)

def test_query_engine_execution(query_engine):
    sql = """
        SELECT c.region, SUM(t.amount) as total_revenue
        FROM transactions t
        JOIN customers c ON t.customer_id = c.customer_id
        GROUP BY c.region
        ORDER BY total_revenue DESC;
    """
    result = query_engine.execute_query(sql)
    
    # Verify Dictionary Structure
    assert "columns" in result
    assert "rows" in result
    assert "dataframe" in result
    
    # Verify Data Correctness based on Seed Data
    df = result["dataframe"]
    assert len(df) == 2  # North America, Europe
    
    # North America total: Acme (5200) + Initech (400) = 5600
    na_revenue = df[df['region'] == 'North America']['total_revenue'].iloc[0]
    assert na_revenue == 5600.00

# --- 3. Excel Exporter Tests ---

def test_excel_exporter_generates_file():
    # Create a mock dataframe
    df = pd.DataFrame({
        "Region": ["North America", "Europe"],
        "Revenue": [5600.00, 5000.00]
    })
    
    excel_bytes = ExcelExporter.export_to_excel(df, "Revenue Report")
    
    # Verify it returns a BytesIO object with content
    assert excel_bytes is not None
    assert excel_bytes.getbuffer().nbytes > 0
    
    # Verify it has the correct Excel magic number/signature (PK..)
    excel_bytes.seek(0)
    assert excel_bytes.read(2) == b'PK'