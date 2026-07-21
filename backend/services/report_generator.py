"""
Generates a corporate-friendly PDF report: a data summary, real charts
(rendered with matplotlib, not screenshots), and AI-written inferences
grounded in the actual numbers — for presenting to stakeholders instead of
sharing a live dashboard link.

Fully dynamic: every label, chart title, and column name comes from the
active dashboard config (backend/services/metadata_store.py), not
hardcoded "Revenue"/"Customers" text. This is the same data shape the
Dashboard itself renders, whether that's the example dataset or something
the user uploaded and mapped themselves.
"""
import io
from datetime import datetime

import matplotlib
matplotlib.use("Agg")  # headless rendering, no display needed
import matplotlib.pyplot as plt

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak
)

from openai import AsyncOpenAI
from backend.core.config import get_settings

settings = get_settings()

# Brand-ish palette so charts don't look like default matplotlib
PRIMARY = "#2563EB"
SECONDARY = "#7C3AED"
ACCENT = "#059669"


def _humanize(col_name: str) -> str:
    """'transaction_date' -> 'Transaction Date'"""
    return col_name.replace("_", " ").title() if col_name else ""


def _make_line_chart(data: list, x_key: str, y_key: str, title: str) -> io.BytesIO:
    fig, ax = plt.subplots(figsize=(6.5, 3.2), dpi=150)
    if data:
        xs = [d[x_key] for d in data]
        ys = [d[y_key] for d in data]
        ax.plot(xs, ys, color=PRIMARY, linewidth=2.5, marker="o", markersize=4)
        ax.fill_between(xs, ys, alpha=0.08, color=PRIMARY)
    ax.set_title(title, fontsize=11, fontweight="bold", loc="left")
    ax.tick_params(axis="x", rotation=45, labelsize=8)
    ax.tick_params(axis="y", labelsize=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    buf.seek(0)
    return buf


def _make_bar_chart(data: list, x_key: str, y_key: str, title: str) -> io.BytesIO:
    fig, ax = plt.subplots(figsize=(6.5, 3.2), dpi=150)
    if data:
        xs = [str(d[x_key]) for d in data]
        ys = [d[y_key] for d in data]
        ax.bar(xs, ys, color=SECONDARY, width=0.6)
    ax.set_title(title, fontsize=11, fontweight="bold", loc="left")
    ax.tick_params(axis="x", rotation=30, labelsize=8)
    ax.tick_params(axis="y", labelsize=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    buf.seek(0)
    return buf


async def _generate_inferences(dashboard_data: dict) -> str:
    """Asks the LLM for inferences grounded strictly in the computed KPIs/series."""
    client = AsyncOpenAI(api_key=settings.AI_API_KEY, base_url=settings.AI_BASE_URL)

    prompt = (
        "You are a financial analyst writing the 'Key Insights' section of an executive report. "
        "Based STRICTLY on the JSON data below (do not invent any numbers not present here), "
        "write 4-6 concise bullet points covering: overall performance, notable trends, any "
        "anomalies flagged, and one actionable recommendation. Write in plain business English, "
        "no jargon, no markdown formatting, no bullet symbols — just short sentences separated by "
        "newlines.\n\n"
        f"DATA:\n{dashboard_data}"
    )
    try:
        response = await client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        return response.choices[0].message.content
    except Exception:
        return (
            "Key insights could not be generated at this time. "
            "Please review the charts and tables above for the underlying data."
        )


async def generate_report(dashboard_data: dict) -> bytes:
    config = dashboard_data.get("config", {})
    amount_label = _humanize(config.get("amount_col")) or "Amount"
    category_label = _humanize(config.get("category_col")) or "Category"
    entity_label = _humanize(config.get("entity_col")) or "Entity"
    dataset_label = config.get("label") or config.get("table_name") or "Dataset"

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle", parent=styles["Title"], textColor=colors.HexColor(PRIMARY), fontSize=24
    )
    heading_style = ParagraphStyle(
        "SectionHeading", parent=styles["Heading2"], textColor=colors.HexColor(PRIMARY),
        spaceBefore=16, spaceAfter=8,
    )
    body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=15)

    story = []

    # --- Cover / Title ---
    story.append(Paragraph("FinPilot AI — Executive Report", title_style))
    story.append(Paragraph(f"Dataset: {dataset_label}", body_style))
    story.append(Paragraph(
        f"Generated on {datetime.now().strftime('%B %d, %Y at %H:%M')}", body_style
    ))
    story.append(Spacer(1, 20))

    # --- KPI Summary Table ---
    kpis = dashboard_data.get("kpis", {})
    story.append(Paragraph("Data Summary", heading_style))
    kpi_table_data = [
        ["Metric", "Value"],
        [f"Total {amount_label}", f"${kpis.get('total_amount', 0):,.2f}"],
        ["Row Count", f"{kpis.get('row_count', 0):,}"],
        [f"Avg. {amount_label}", f"${kpis.get('avg_amount', 0):,.2f}"],
    ]
    if kpis.get("distinct_count") is not None:
        kpi_table_data.append([f"Distinct {_humanize(kpis.get('distinct_label'))}", f"{kpis['distinct_count']:,}"])

    kpi_table = Table(kpi_table_data, colWidths=[2.5 * inch, 2.5 * inch])
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(PRIMARY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 12))

    # --- Anomalies (if any) ---
    anomalies = dashboard_data.get("anomalies", [])
    if anomalies:
        story.append(Paragraph("Flagged Anomalies", heading_style))
        for a in anomalies:
            story.append(Paragraph(
                f"• {a['label']}: {a['direction']} average by {abs(a['z_score'])} standard deviations "
                f"(value: {a['value']:,.2f})", body_style
            ))
        story.append(Spacer(1, 12))

    # --- Charts ---
    trend = dashboard_data.get("trend", [])
    if trend:
        story.append(Paragraph(f"{amount_label} Trend", heading_style))
        chart_buf = _make_line_chart(trend, "period", "amount", f"{amount_label} by Period")
        story.append(Image(chart_buf, width=6.5 * inch, height=3.2 * inch))
        story.append(Spacer(1, 10))

    by_category = dashboard_data.get("by_category", [])
    if by_category:
        story.append(Paragraph(f"{amount_label} by {category_label}", heading_style))
        chart_buf = _make_bar_chart(by_category, "category", "amount", f"{amount_label} by {category_label}")
        story.append(Image(chart_buf, width=6.5 * inch, height=3.2 * inch))
        story.append(Spacer(1, 10))

    top_entities = dashboard_data.get("top_entities", [])
    if top_entities:
        story.append(Paragraph(f"Top {entity_label}", heading_style))
        chart_buf = _make_bar_chart(top_entities, "entity", "amount", f"Top {entity_label} by {amount_label}")
        story.append(Image(chart_buf, width=6.5 * inch, height=3.2 * inch))

    if not trend and not by_category and not top_entities:
        story.append(Paragraph(
            "No trend, category, or entity breakdowns are available for this dataset's current column mapping.",
            body_style
        ))

    story.append(PageBreak())

    # --- AI-generated inferences ---
    story.append(Paragraph("Key Insights", heading_style))
    inferences = await _generate_inferences(dashboard_data)
    for line in inferences.split("\n"):
        line = line.strip().lstrip("•-* ")
        if line:
            story.append(Paragraph(f"• {line}", body_style))
            story.append(Spacer(1, 4))

    doc.build(story)
    buf.seek(0)
    return buf.read()
