"""
Handles CSV uploads: validates the file, sanitizes a table name, and writes
it into the same SQLite database the chat feature queries — so uploaded
data becomes immediately askable in natural language.

Also detects whether a file is usable for the Dashboard (needs at least one
numeric column) versus chat-only (still fully queryable in Copilot AI, just
can't power KPIs/charts) — a file being "unsuitable" for the dashboard is
never a hard rejection, just an honest heads-up.
"""
import re
import pandas as pd
from io import BytesIO
from sqlalchemy import create_engine
from fastapi import HTTPException

MAX_ROWS = 50_000  # sane cap for a free-tier college project, not a data warehouse
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB — generous for a CSV, prevents memory abuse

# Try these encodings in order. Most real-world "weird" CSVs (exported from
# Excel on Windows, non-English locales, etc.) are one of these, not UTF-8.
ENCODING_FALLBACKS = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]


def sanitize_table_name(filename: str) -> str:
    """Turns 'My Sales Data (2024).csv' into a safe SQL identifier like 'my_sales_data_2024'."""
    name = filename.rsplit(".", 1)[0]
    name = re.sub(r"[^a-zA-Z0-9_]", "_", name).lower()
    name = re.sub(r"_+", "_", name).strip("_")
    if not name or not name[0].isalpha():
        name = f"t_{name}"
    return name[:50]


def _read_csv_with_fallback(file_bytes: bytes) -> pd.DataFrame:
    last_error = None
    for encoding in ENCODING_FALLBACKS:
        try:
            return pd.read_csv(BytesIO(file_bytes), encoding=encoding)
        except UnicodeDecodeError as e:
            last_error = e
            continue
        except Exception as e:
            # Not an encoding problem — a real parse error (bad delimiters,
            # binary garbage, etc.). No point retrying other encodings.
            raise HTTPException(
                status_code=400,
                detail=f"Couldn't parse this as a CSV file: {str(e)}. "
                       f"Make sure it's a genuine comma-separated file, not renamed from another format."
            )
    raise HTTPException(
        status_code=400,
        detail="Couldn't read this file's text encoding. Try re-saving it as UTF-8 CSV and uploading again."
    )


def process_csv_upload(db_url: str, filename: str, file_bytes: bytes) -> dict:
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail=f"'{filename}': only .csv files are supported right now.")

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"'{filename}' is too large ({len(file_bytes) / 1024 / 1024:.1f}MB). "
                   f"The limit is {MAX_FILE_SIZE_BYTES / 1024 / 1024:.0f}MB for this demo."
        )

    df = _read_csv_with_fallback(file_bytes)

    if df.empty or len(df.columns) == 0:
        raise HTTPException(status_code=400, detail=f"'{filename}' has no rows or columns to import.")

    if len(df) > MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"'{filename}' has {len(df)} rows, which is over the {MAX_ROWS} row limit for this demo."
        )

    # Clean column names too, since they'll appear in generated SQL
    df.columns = [re.sub(r"[^a-zA-Z0-9_]", "_", str(c)).lower().strip("_") or f"col_{i}"
                  for i, c in enumerate(df.columns)]

    table_name = sanitize_table_name(filename)

    engine = create_engine(db_url)
    # Note: if a table with this name already exists (e.g. re-uploading the
    # same file), we replace it rather than erroring, since that's the
    # expected behavior for "update my data" in a demo context.
    df.to_sql(table_name, engine, if_exists="replace", index=False)

    # Dashboard eligibility: needs at least one numeric column to compute any
    # KPI/chart from. A file with none isn't rejected — it's still fully
    # queryable in Copilot AI — it just can't power the Dashboard.
    numeric_cols = list(df.select_dtypes(include=["number"]).columns)
    date_like_cols = [c for c in df.columns if _looks_like_date_column(df[c])]
    dashboard_eligible = len(numeric_cols) > 0
    ineligible_reason = None if dashboard_eligible else (
        "This file has no numeric columns, so it can't power KPIs or charts on the Dashboard. "
        "You can still ask questions about it in Copilot AI."
    )

    return {
        "table_name": table_name,
        "row_count": len(df),
        "columns": list(df.columns),
        "numeric_columns": numeric_cols,
        "date_like_columns": date_like_cols,
        "dashboard_eligible": dashboard_eligible,
        "ineligible_reason": ineligible_reason,
    }


def _looks_like_date_column(series: pd.Series, sample_size: int = 20) -> bool:
    """Best-effort heuristic: does this column look parseable as a date?"""
    sample = series.dropna().astype(str).head(sample_size)
    if sample.empty:
        return False
    try:
        parsed = pd.to_datetime(sample, errors="coerce", format="mixed")
        return parsed.notna().mean() > 0.8
    except Exception:
        return False
