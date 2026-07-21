import pandas as pd
from sqlalchemy import text
from fastapi import HTTPException
from backend.services.db_inspector import DatabaseInspector

class QueryEngine:
    def __init__(self, db_url: str):
        self.inspector = DatabaseInspector(db_url)
        self.engine = self.inspector.engine

    def execute_query(self, sql_query: str) -> dict:
        """
        Executes a validated SQL query safely and returns structured data.
        """
        try:
            with self.engine.connect() as connection:
                # Execution is safe here because of Phase 1 SQLValidator
                result = connection.execute(text(sql_query))
                columns = list(result.keys())
                
                # Fetch data and cast to standard python types for JSON serialization
                rows = [dict(zip(columns, row)) for row in result.fetchall()]
                
            # Load into Pandas for downstream analytics and export
            df = pd.DataFrame(rows)
            
            return {
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "dataframe": df
            }
            
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Database execution failed: {str(e)}"
            )

    def execute_mutation(self, sql_query: str, table_name_for_drop: str = None) -> dict:
        """
        Executes a confirmed data-modifying statement (INSERT/UPDATE/DELETE).
        DROP is handled separately via DatabaseInspector.drop_table (which
        does existence-checking and metadata cleanup), not through here.
        """
        try:
            with self.engine.connect() as connection:
                result = connection.execute(text(sql_query))
                connection.commit()
                rows_affected = result.rowcount if result.rowcount is not None and result.rowcount >= 0 else 0
            return {"rows_affected": rows_affected}
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Database execution failed: {str(e)}"
            )