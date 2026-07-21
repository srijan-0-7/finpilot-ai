from sqlalchemy import create_engine, inspect, text
from fastapi import HTTPException
from typing import Dict, List, Any
from backend.services import metadata_store

class DatabaseInspector:
    def __init__(self, db_url: str):
        self.engine = create_engine(db_url)
        self.inspector = inspect(self.engine)

    def refresh_schema(self):
        """
        Re-inspects the schema from the live database. Needed because tables
        can be added or dropped at runtime (e.g. via CSV upload or the
        delete-table endpoint), and self.inspector was only populated once
        at construction time.

        Note: this deliberately uses only `inspect()`, not SQLAlchemy's
        MetaData().reflect(). The latter tries to resolve every foreign key
        target while reflecting, which raises NoSuchTableError if a table
        was dropped while another table still has a foreign key pointing at
        it (SQLite doesn't enforce FK integrity on DROP TABLE by default, so
        this situation is normal, not corruption).
        """
        self.inspector = inspect(self.engine)

    def drop_table(self, table_name: str):
        """
        Drops a table or view. Name is checked against the real, live list of
        existing tables/views first (not just quoted/escaped) — this is what
        actually prevents SQL injection here, since an f-string DROP
        statement would otherwise be dangerous with an arbitrary name input.
        """
        self.refresh_schema()
        real_tables = set(self.inspector.get_table_names())
        real_views = set(self.inspector.get_view_names())

        if table_name in real_tables:
            drop_stmt = f'DROP TABLE "{table_name}"'
        elif table_name in real_views:
            drop_stmt = f'DROP VIEW "{table_name}"'
        else:
            raise HTTPException(status_code=404, detail=f"Table or view '{table_name}' doesn't exist.")

        with self.engine.connect() as conn:
            conn.execute(text(drop_stmt))
            conn.commit()

        self.refresh_schema()

    def get_schema_summary(self) -> Dict[str, Any]:
        """
        Generates a structured representation of tables, columns, and relationships.
        Used to build the context window for the LLM.
        """
        schema_info = {
            "tables": [],
            "relationships": []
        }

        # Real tables + views (views matter here since the example dataset's
        # dashboard is powered by a denormalized view, and users can query
        # views in chat exactly like tables).
        all_names = list(self.inspector.get_table_names()) + list(self.inspector.get_view_names())

        for table_name in all_names:
            columns = self.inspector.get_columns(table_name)
            table_meta = {
                "name": table_name,
                "columns": [
                    {
                        "name": col["name"],
                        "type": str(col["type"]),
                        "primary_key": col.get("primary_key", 0) > 0
                    } for col in columns
                ]
            }
            schema_info["tables"].append(table_meta)
            
            # Extract Foreign Keys for JOIN context (real tables only — views
            # don't have FK constraints of their own)
            if table_name in self.inspector.get_table_names():
                fks = self.inspector.get_foreign_keys(table_name)
                for fk in fks:
                    schema_info["relationships"].append({
                        "from_table": table_name,
                        "from_column": fk["constrained_columns"],
                        "to_table": fk["referred_table"],
                        "to_column": fk["referred_columns"]
                    })

        # User-defined relationships (from the relationship canvas) — these
        # exist because pandas-uploaded tables have no real FK constraints at
        # the database level, so this is how the AI learns about joins
        # between uploaded tables that the user has explicitly connected.
        try:
            for rel in metadata_store.list_relationships():
                schema_info["relationships"].append({
                    "from_table": rel["table_a"],
                    "from_column": [rel["column_a"]],
                    "to_table": rel["table_b"],
                    "to_column": [rel["column_b"]]
                })
        except Exception:
            pass  # metadata db not initialized yet — fine, just skip

        return schema_info

    def get_schema_ddl_for_ai(self) -> str:
        """
        Formats the schema into a concise string optimized for LLM token limits.
        """
        schema = self.get_schema_summary()
        prompt_text = "Database Schema:\n"
        
        for table in schema["tables"]:
            prompt_text += f"Table: {table['name']}\nColumns: "
            col_strings = [f"{c['name']} ({c['type']})" for c in table['columns']]
            prompt_text += ", ".join(col_strings) + "\n\n"
            
        prompt_text += "Relationships:\n"
        for rel in schema["relationships"]:
            prompt_text += f"{rel['from_table']}.{rel['from_column'][0]} -> {rel['to_table']}.{rel['to_column'][0]}\n"
            
        return prompt_text