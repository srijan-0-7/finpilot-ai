from pydantic import BaseModel, Field
from typing import List

class NLToSQLResponse(BaseModel):
    sql_query: str = Field(
        description="The strictly valid, executable SQL query. Do not include markdown formatting or backticks."
    )
    explanation: str = Field(
        description="A concise, professional explanation of what the query does, how joins work, and what the user should expect in the result."
    )
    is_safe: bool = Field(
        description="A boolean indicating if the query is safe (read-only SELECT). Return false if the user asked for a destructive operation."
    )
    confidence: float = Field(
        default=0.9,
        description="Your confidence (0.0 to 1.0) that this query correctly answers the user's question given the schema. Lower this if the question was ambiguous or the schema only partially covers what was asked."
    )
    caveats: List[str] = Field(
        default_factory=list,
        description="Any important caveats about this answer, e.g. 'this excludes null regions' or 'assumes fiscal year = calendar year'. Empty list if none."
    )
    follow_up_questions: List[str] = Field(
        default_factory=list,
        description="2-3 natural follow-up questions the user might want to ask next, based on this question and schema. Keep them short and specific."
    )
    operation_type: str = Field(
        default="SELECT",
        description="Classify the SQL statement as one of: SELECT, INSERT, UPDATE, DELETE, DROP. Use SELECT for any read/reporting question. Only use INSERT/UPDATE/DELETE/DROP if the user explicitly asked to add, change, remove, or delete data/tables — never generate a mutating statement unless the user's wording clearly requests one."
    )