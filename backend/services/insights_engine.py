from openai import AsyncOpenAI
import pandas as pd
from backend.core.config import get_settings

settings = get_settings()

class InsightsEngine:
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.AI_API_KEY, base_url=settings.AI_BASE_URL)
        self.model = settings.AI_MODEL

    async def generate_executive_summary(self, user_query: str, df: pd.DataFrame) -> str:
        """
        Generates a factual business insight summary based STRICTLY on the dataframe.
        """
        if df.empty:
            return "No data returned to generate insights."

        # Extract statistical metadata instead of raw rows to prevent token overflow
        # and ensure the AI only speaks to the actual data distribution.
        data_summary = df.describe(include='all').to_json()
        sample_data = df.head(5).to_json(orient='records')

        system_prompt = (
            "You are an elite Financial Data Analyst. "
            "Based ONLY on the provided JSON data summary and sample, provide 3 bullet points of concise, "
            "factual business insights. "
            "NEVER hallucinate metrics, dates, or trends not present in the data."
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"User's goal: {user_query}\n\nData Summary: {data_summary}\n\nSample: {sample_data}"}
                ],
                temperature=0.1
            )
            return response.choices[0].message.content
            
        except Exception as e:
            return "Unable to generate insights at this time."

    async def explain_chart(self, chart_title: str, data: list) -> str:
        """
        Explains a chart's data in plain English for someone with no
        finance background — used by the 'Explain this chart' button.
        """
        if not data:
            return "There's no data in this chart to explain yet."

        system_prompt = (
            "You are explaining a business chart to someone with no finance or data background. "
            "Use simple, everyday language and short sentences. Based ONLY on the data given, "
            "explain what the chart shows and why it might matter, in 3-4 sentences. "
            "Do not invent numbers not present in the data."
        )
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Chart title: {chart_title}\n\nData: {data}"}
                ],
                temperature=0.2
            )
            return response.choices[0].message.content
        except Exception:
            return "Unable to explain this chart right now."