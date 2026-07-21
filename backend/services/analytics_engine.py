"""
Computes real numbers for the dashboard from whatever table the user has
configured as their "dashboard source" — not hardcoded to the demo
customers/products/transactions schema. Also provides two lightweight,
honest "ML" features:

- Anomaly detection: statistical (>2 standard deviations from the mean),
  not a trained model. Fast, explainable, doesn't need training data.
- Correlation finder: real Pearson correlation coefficients between numeric
  columns, computed with numpy — not an LLM guessing at relationships.
- Forecasting: a simple linear trend projection (numpy polyfit degree 1),
  labeled as such everywhere it's surfaced.

The demo dataset (customers/products/transactions) is wired up through the
exact same config mechanism as any user upload — see backend/seed_app_db.py,
which creates a denormalized view and registers it as the default active
dashboard config. There's no special-cased "demo mode" code path here.
"""
from sqlalchemy import create_engine, text, inspect
from fastapi import HTTPException
import pandas as pd
import numpy as np

from backend.services import metadata_store


class AnalyticsEngine:
    def __init__(self, db_url: str):
        self.engine = create_engine(db_url)

    def _validate_columns(self, table_name: str, columns: list):
        """
        Column/table names here come from user selections (dropdowns) but
        we still verify them against the real live schema before ever
        interpolating them into SQL — the same principle as the table-name
        check in drop_table, applied here for column names.
        """
        inspector = inspect(self.engine)
        if table_name not in inspector.get_table_names() and table_name not in inspector.get_view_names():
            raise HTTPException(status_code=404, detail=f"Table or view '{table_name}' doesn't exist.")
        real_columns = {c["name"] for c in inspector.get_columns(table_name)}
        for col in columns:
            if col and col not in real_columns:
                raise HTTPException(status_code=400, detail=f"Column '{col}' doesn't exist in '{table_name}'.")

    def get_dashboard_data(self, user_id: str, config: dict = None) -> dict:
        if config is None:
            config = metadata_store.get_active_dashboard_config(user_id)
        if not config:
            raise HTTPException(
                status_code=404,
                detail="No dashboard is set up yet. Go to Data Explorer, upload a CSV (or use the "
                       "example dataset), and map its columns to power the dashboard."
            )

        table = config["table_name"]
        date_col = config.get("date_col")
        amount_col = config["amount_col"]
        category_col = config.get("category_col")
        entity_col = config.get("entity_col")

        self._validate_columns(table, [date_col, amount_col, category_col, entity_col])

        with self.engine.connect() as conn:
            total_amount = conn.execute(text(f'SELECT COALESCE(SUM("{amount_col}"), 0) FROM "{table}"')).scalar()
            row_count = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar()
            avg_amount = conn.execute(text(f'SELECT COALESCE(AVG("{amount_col}"), 0) FROM "{table}"')).scalar()

            distinct_count = None
            distinct_label = None
            distinct_source_col = entity_col or category_col
            if distinct_source_col:
                distinct_count = conn.execute(
                    text(f'SELECT COUNT(DISTINCT "{distinct_source_col}") FROM "{table}"')
                ).scalar()
                distinct_label = distinct_source_col

            trend_df = pd.DataFrame()
            if date_col:
                # Note: we deliberately do NOT use SQL strftime() here.
                # SQLite's strftime requires a full ISO date string
                # ("2024-01-15") and silently returns NULL for common
                # real-world formats like month-only "2024-01" — which
                # would make every row collapse into one null bucket.
                # pandas' date parser is far more lenient, so we pull the
                # raw column and group in Python instead.
                raw_dates_df = pd.read_sql(text(f'SELECT "{date_col}" as raw_date, "{amount_col}" as amount FROM "{table}"'), conn)
                parsed = pd.to_datetime(raw_dates_df["raw_date"], errors="coerce", format="mixed")
                raw_dates_df["period"] = parsed.dt.strftime("%Y-%m")
                raw_dates_df = raw_dates_df.dropna(subset=["period"])
                trend_df = (
                    raw_dates_df.groupby("period")["amount"].sum().reset_index().sort_values("period")
                )

            by_category_df = pd.DataFrame()
            if category_col:
                by_category_df = pd.read_sql(text(f"""
                    SELECT "{category_col}" as category, SUM("{amount_col}") as amount
                    FROM "{table}"
                    GROUP BY category
                    ORDER BY amount DESC
                """), conn)

            top_entities_df = pd.DataFrame()
            if entity_col and entity_col != category_col:
                top_entities_df = pd.read_sql(text(f"""
                    SELECT "{entity_col}" as entity, SUM("{amount_col}") as amount
                    FROM "{table}"
                    GROUP BY entity
                    ORDER BY amount DESC
                    LIMIT 5
                """), conn)

        anomalies = self._detect_anomalies(trend_df, "amount", "period") if not trend_df.empty else []

        return {
            "config": {
                "table_name": table,
                "label": config.get("label") or table,
                "date_col": date_col,
                "amount_col": amount_col,
                "category_col": category_col,
                "entity_col": entity_col,
            },
            "kpis": {
                "total_amount": float(total_amount or 0),
                "row_count": int(row_count or 0),
                "avg_amount": round(float(avg_amount or 0), 2),
                "distinct_count": int(distinct_count) if distinct_count is not None else None,
                "distinct_label": distinct_label,
            },
            "trend": trend_df.to_dict(orient="records"),
            "by_category": by_category_df.to_dict(orient="records"),
            "top_entities": top_entities_df.to_dict(orient="records"),
            "anomalies": anomalies,
        }

    def _detect_anomalies(self, df: pd.DataFrame, value_col: str, label_col: str, threshold: float = 2.0) -> list:
        """Flags points more than `threshold` standard deviations from the mean."""
        if df.empty or len(df) < 3:
            return []
        values = df[value_col].astype(float)
        mean = values.mean()
        std = values.std()
        if std == 0 or pd.isna(std):
            return []
        anomalies = []
        for _, row in df.iterrows():
            z_score = (row[value_col] - mean) / std
            if abs(z_score) > threshold:
                anomalies.append({
                    "label": row[label_col],
                    "value": float(row[value_col]),
                    "z_score": round(float(z_score), 2),
                    "direction": "above" if z_score > 0 else "below",
                })
        return anomalies

    def find_correlations(self, user_id: str, table_name: str = None) -> dict:
        """Computes real Pearson correlations between all numeric columns in a table."""
        if not table_name:
            config = metadata_store.get_active_dashboard_config(user_id)
            if not config:
                return {"correlations": [], "note": "No dashboard source configured yet."}
            table_name = config["table_name"]

        self._validate_columns(table_name, [])

        with self.engine.connect() as conn:
            df = pd.read_sql(text(f'SELECT * FROM "{table_name}"'), conn)

        numeric_df = df.select_dtypes(include=[np.number])
        if numeric_df.shape[1] < 2:
            return {"correlations": [], "note": "Not enough numeric columns to correlate."}

        corr_matrix = numeric_df.corr(method="pearson")
        pairs = []
        cols = corr_matrix.columns
        for i in range(len(cols)):
            for j in range(i + 1, len(cols)):
                val = corr_matrix.iloc[i, j]
                if pd.notna(val):
                    pairs.append({
                        "column_a": cols[i],
                        "column_b": cols[j],
                        "correlation": round(float(val), 3),
                    })
        pairs.sort(key=lambda p: abs(p["correlation"]), reverse=True)
        return {"correlations": pairs}

    def forecast_series(self, user_id: str, table_name: str = None, date_col: str = None, value_col: str = None, periods: int = 3) -> dict:
        """
        Simple linear trend forecast (numpy polyfit, degree 1) grouped by month.
        Explicitly NOT a seasonal or ARIMA-style model — labeled as such.
        """
        if not table_name or not date_col or not value_col:
            config = metadata_store.get_active_dashboard_config(user_id)
            if not config or not config.get("date_col"):
                return {"history": [], "forecast": [], "note": "No dashboard source with a date column configured yet."}
            table_name = table_name or config["table_name"]
            date_col = date_col or config["date_col"]
            value_col = value_col or config["amount_col"]

        self._validate_columns(table_name, [date_col, value_col])

        with self.engine.connect() as conn:
            # Same fix as the trend chart above: parse dates in pandas, not
            # SQLite's strftime, which fails on month-only date strings.
            raw_df = pd.read_sql(text(f'SELECT "{date_col}" as raw_date, "{value_col}" as value FROM "{table_name}"'), conn)

        parsed = pd.to_datetime(raw_df["raw_date"], errors="coerce", format="mixed")
        raw_df["month"] = parsed.dt.strftime("%Y-%m")
        raw_df = raw_df.dropna(subset=["month"])
        df = raw_df.groupby("month")["value"].sum().reset_index().sort_values("month")

        if len(df) < 2:
            return {"history": [], "forecast": [], "note": "Not enough historical data to forecast."}

        x = np.arange(len(df))
        y = df["value"].astype(float).values
        coeffs = np.polyfit(x, y, deg=1)
        slope, intercept = coeffs[0], coeffs[1]

        forecast_points = []
        last_month = df["month"].iloc[-1]
        year, month = int(last_month[:4]), int(last_month[5:7])
        for i in range(1, periods + 1):
            future_x = len(df) - 1 + i
            predicted = slope * future_x + intercept
            month += 1
            if month > 12:
                month = 1
                year += 1
            forecast_points.append({
                "month": f"{year:04d}-{month:02d}",
                "predicted_value": round(float(max(predicted, 0)), 2),
            })

        return {
            "history": df.to_dict(orient="records"),
            "forecast": forecast_points,
            "trend": "increasing" if slope > 0 else "decreasing",
            "method": "linear_trend",
        }
