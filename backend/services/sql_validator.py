import re
from fastapi import HTTPException
from backend.core.config import get_settings

settings = get_settings()

MUTATION_KEYWORDS = {"INSERT", "UPDATE", "DELETE", "DROP"}
# These remain blocked even with confirmation — schema-altering operations
# beyond simple table drops (which have their own dedicated, safer endpoint
# with existence-checking) are out of scope for chat-driven SQL.
ALWAYS_BLOCKED_KEYWORDS = re.compile(
    r'\b(TRUNCATE|ALTER|GRANT|REVOKE|COMMIT|ROLLBACK|ATTACH|DETACH|PRAGMA|VACUUM|REPLACE INTO)\b',
    re.IGNORECASE
)


class SQLValidator:

    @staticmethod
    def _strip_comments(sql_query: str) -> str:
        clean = re.sub(r'--.*$', '', sql_query, flags=re.MULTILINE)
        clean = re.sub(r'/\*.*?\*/', '', clean, flags=re.DOTALL)
        return clean

    @classmethod
    def classify_operation(cls, sql_query: str) -> str:
        """Returns 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', or 'OTHER'."""
        clean = cls._strip_comments(sql_query).strip().upper()
        for keyword in ("SELECT", "WITH", "INSERT", "UPDATE", "DELETE", "DROP"):
            if clean.startswith(keyword):
                return "SELECT" if keyword == "WITH" else keyword
        return "OTHER"

    @classmethod
    def _validate_single_statement(cls, clean_query: str):
        """
        Rejects multiple semicolon-separated statements (e.g.
        "SELECT 1; DROP TABLE users") — the classic injection pattern where
        a second, unreviewed statement rides along with a legitimate one.
        A single trailing semicolon is fine.
        """
        stripped = clean_query.strip().rstrip(";")
        if ";" in stripped:
            raise HTTPException(
                status_code=403,
                detail="Only a single SQL statement is allowed per request."
            )

    @classmethod
    def validate_query(cls, sql_query: str) -> bool:
        """
        Validates a READ-ONLY query. Used for the default chat flow and
        Excel export — these paths should never mutate data, regardless of
        the mutation-with-confirmation feature below.
        """
        if not sql_query or not sql_query.strip():
            raise ValueError("Query cannot be empty.")

        clean_query = cls._strip_comments(sql_query)
        cls._validate_single_statement(clean_query)

        if ALWAYS_BLOCKED_KEYWORDS.search(clean_query):
            raise HTTPException(status_code=403, detail="This type of SQL operation isn't supported.")

        operation = cls.classify_operation(sql_query)
        if operation != "SELECT":
            raise HTTPException(
                status_code=403,
                detail="Only SELECT queries are allowed here. Data changes go through the confirmation flow."
            )

        return True

    @classmethod
    def validate_mutation_query(cls, sql_query: str) -> str:
        """
        Validates a data-mutating query (INSERT/UPDATE/DELETE/DROP) that the
        user has explicitly confirmed after seeing a warning. Returns the
        classified operation type. Still blocks multi-statement injection
        and schema-altering operations beyond simple DROP TABLE.
        """
        if not sql_query or not sql_query.strip():
            raise ValueError("Query cannot be empty.")

        clean_query = cls._strip_comments(sql_query)
        cls._validate_single_statement(clean_query)

        if ALWAYS_BLOCKED_KEYWORDS.search(clean_query):
            raise HTTPException(
                status_code=403,
                detail="This type of operation (schema changes beyond dropping a table) isn't supported via chat."
            )

        operation = cls.classify_operation(sql_query)
        if operation not in MUTATION_KEYWORDS:
            raise HTTPException(status_code=400, detail="This isn't a recognized data-modifying statement.")

        return operation
