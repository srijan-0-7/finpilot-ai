import json
import re
from openai import AsyncOpenAI
from fastapi import HTTPException
from backend.core.config import get_settings
from backend.models.schemas import NLToSQLResponse
from backend.utils.prompts import SYSTEM_PROMPT_TEMPLATE
from backend.services.db_inspector import DatabaseInspector
from backend.services.sql_validator import SQLValidator

settings = get_settings()

class AIEngine:
    def __init__(self, db_url: str):
        # We use AsyncOpenAI for non-blocking API calls in FastAPI.
        # base_url points at Groq's free, OpenAI-compatible endpoint instead
        # of OpenAI's paid one.
        self.client = AsyncOpenAI(api_key=settings.AI_API_KEY, base_url=settings.AI_BASE_URL)
        self.model = settings.AI_MODEL
        self.db_inspector = DatabaseInspector(db_url)
        # Identify dialect for prompt context (e.g., sqlite, postgresql)
        self.dialect = db_url.split("://")[0] 

    async def translate_nl_to_sql(self, user_query: str) -> NLToSQLResponse:
        """
        Translates natural language to SQL, enforcing schema awareness and safety.
        """
        try:
            # 1. Fetch live schema (refresh first in case a CSV was uploaded
            # since this engine was constructed)
            self.db_inspector.refresh_schema()
            schema_ddl = self.db_inspector.get_schema_ddl_for_ai()
            
            # 2. Construct Prompt
            system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
                dialect=self.dialect,
                schema_ddl=schema_ddl
            )

            # 3. Call LLM with forced JSON Schema via tools/functions.
            # We repeat the schema in the user turn (not just the system
            # prompt) because smaller/faster models tend to weight the most
            # recent message more heavily and otherwise ignore the schema.
            user_content = (
                f"Available tables and columns:\n{schema_ddl}\n\n"
                f"Question: {user_query}\n\n"
                "Remember: only use the exact tables/columns listed above."
            )

            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                tools=[{
                    "type": "function",
                    "function": {
                        "name": "provide_sql_and_explanation",
                        "description": "Output the generated SQL and its explanation.",
                        "parameters": NLToSQLResponse.model_json_schema()
                    }
                }],
                tool_choice={"type": "function", "function": {"name": "provide_sql_and_explanation"}},
                temperature=0.0 # Strict determinism for code generation
            )

            # 4. Parse output
            tool_call = response.choices[0].message.tool_calls[0]
            result_json = json.loads(tool_call.function.arguments)
            structured_response = NLToSQLResponse(**result_json)

            # 5. Secondary Safety Check (Defense in Depth)
            if not structured_response.is_safe:
                raise HTTPException(status_code=403, detail=structured_response.explanation)

            operation = SQLValidator.classify_operation(structured_response.sql_query)
            if operation == "SELECT":
                SQLValidator.validate_query(structured_response.sql_query)
            else:
                # Mutation statements are validated here (single-statement,
                # no schema-altering keywords) but NOT executed yet — the
                # route layer returns this as "requires confirmation" and a
                # separate, explicit confirm step actually runs it.
                SQLValidator.validate_mutation_query(structured_response.sql_query)
            structured_response.operation_type = operation

            # 6. Guard against hallucinated tables: the model can still
            # occasionally invent a table name it "expects" to exist
            # (e.g. "sales", "regions") instead of using the real schema.
            # Catch that here with a clear, actionable error rather than
            # letting a raw sqlite "no such table" error reach the user.
            # Covers SELECT (FROM/JOIN), UPDATE, DELETE FROM, and INSERT INTO.
            real_tables = set(self.db_inspector.inspector.get_table_names()) | set(self.db_inspector.inspector.get_view_names())
            referenced_tables = set(
                re.findall(r'(?:FROM|JOIN|UPDATE|INTO)\s+["`\[]?(\w+)["`\]]?', structured_response.sql_query, re.IGNORECASE)
            )
            unknown_tables = {t for t in referenced_tables if t.lower() not in {rt.lower() for rt in real_tables}}
            if unknown_tables:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"The AI tried to query table(s) that don't exist in this database: "
                        f"{', '.join(sorted(unknown_tables))}. Available tables are: "
                        f"{', '.join(sorted(real_tables))}. Try rephrasing your question using "
                        f"those tables, or ask again — this can happen occasionally with the free model."
                    )
                )

            return structured_response

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI Engine Error: {str(e)}")