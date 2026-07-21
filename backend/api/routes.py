from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from typing import Optional, List
import io
import re
import hashlib

from backend.core.config import get_settings
from backend.core.rate_limiter import limiter
from backend.services.ai_engine import AIEngine
from backend.services.query_engine import QueryEngine
from backend.services.insights_engine import InsightsEngine
from backend.services.excel_exporter import ExcelExporter
from backend.services.db_inspector import DatabaseInspector
from backend.services.sql_validator import SQLValidator
from backend.services.analytics_engine import AnalyticsEngine
from backend.services.upload_service import process_csv_upload
from backend.services.report_generator import generate_report
from backend.services import metadata_store, auth_service

router = APIRouter()

settings = get_settings()

# insights_engine is stateless (just calls the external AI API on whatever
# dataframe it's handed) so one shared instance is fine.
insights_engine = InsightsEngine()

metadata_store.init_metadata_db()

# Per-account service instances, built lazily on first use and cached by
# user_id. Each account's engines point at its own isolated SQLite file
# (see core/config.py's get_user_db_url) — this is what keeps one account's
# uploads/drops from ever touching another account's data. Do NOT replace
# this with a single module-level engine again; that's the exact bug this
# was built to fix.
_user_services_cache: dict = {}


def _get_user_id(request: Request) -> str:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in.")
    return user["user_id"]


def _get_user_services(user_id: str) -> dict:
    if user_id not in _user_services_cache:
        user_db_url = settings.get_user_db_url(user_id)
        _user_services_cache[user_id] = {
            "db_url": user_db_url,
            "ai_engine": AIEngine(user_db_url),
            "query_engine": QueryEngine(user_db_url),
            "db_inspector": DatabaseInspector(user_db_url),
            "analytics_engine": AnalyticsEngine(user_db_url),
        }
    return _user_services_cache[user_id]


class ChatRequest(BaseModel):
    query: str


class ExportRequest(BaseModel):
    sql: str


class ExplainChartRequest(BaseModel):
    chart_title: str
    data: list


class ShareRequest(BaseModel):
    title: str
    payload: dict


class ForecastRequest(BaseModel):
    table_name: Optional[str] = None
    date_col: Optional[str] = None
    value_col: Optional[str] = None
    periods: int = 3


class RelationshipRequest(BaseModel):
    table_a: str
    column_a: str
    table_b: str
    column_b: str


class DashboardConfigRequest(BaseModel):
    table_name: str
    date_col: Optional[str] = None
    amount_col: str
    category_col: Optional[str] = None
    entity_col: Optional[str] = None
    label: Optional[str] = None


class MutationConfirmRequest(BaseModel):
    sql: str
    operation_type: str


class SignupRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class DemoLoginRequest(BaseModel):
    access_key: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ============================================================
# Auth (no auth required to reach these — they're how you get a session)
# ============================================================

@router.post("/auth/signup")
@limiter.limit("10/minute")
async def signup(request: Request, body: SignupRequest):
    return auth_service.signup(body.email, body.password)


@router.post("/auth/login")
@limiter.limit("15/minute")
async def login(request: Request, body: LoginRequest):
    return auth_service.login(body.email, body.password)


@router.post("/auth/demo-login")
@limiter.limit("20/minute")
async def demo_login(request: Request, body: DemoLoginRequest):
    return auth_service.demo_login(body.access_key)


@router.get("/auth/me")
@limiter.limit("60/minute")
async def get_me(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in.")
    full_user = metadata_store.get_user_by_id(user["user_id"])
    return {
        "email": user["email"],
        "is_demo": bool(user["is_demo"]),
        "member_since": full_user["created_at"] if full_user else None,
    }


@router.post("/auth/change-password")
@limiter.limit("10/minute")
async def change_password_route(request: Request, body: ChangePasswordRequest):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in.")
    auth_service.change_password(user["user_id"], body.current_password, body.new_password)
    return {"ok": True}


@router.post("/auth/logout")
@limiter.limit("30/minute")
async def logout(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
    if token:
        metadata_store.delete_session(token)
    return {"ok": True}


# ============================================================
# Chat / Ask
# ============================================================

@router.post("/ask")
@limiter.limit("15/minute")
async def ask_finpilot(request: Request, body: ChatRequest):
    user_id = _get_user_id(request)
    services = _get_user_services(user_id)
    ai_engine = services["ai_engine"]
    query_engine = services["query_engine"]

    nl_response = await ai_engine.translate_nl_to_sql(body.query)

    # Data-modifying statements are NOT executed here. They're returned with
    # a warning flag so the frontend can show an explicit confirmation step
    # before anything actually changes — /execute-mutation is the only path
    # that runs them, and only after the user confirms.
    if nl_response.operation_type != "SELECT":
        return {
            "sql": nl_response.sql_query,
            "explanation": nl_response.explanation,
            "confidence": nl_response.confidence,
            "caveats": nl_response.caveats,
            "follow_up_questions": [],
            "operation_type": nl_response.operation_type,
            "requires_confirmation": True,
            "data": None,
            "insights": None,
        }

    query_results = query_engine.execute_query(nl_response.sql_query)

    insights = await insights_engine.generate_executive_summary(
        user_query=body.query,
        df=query_results["dataframe"]
    )
    query_results.pop("dataframe")

    try:
        metadata_store.add_history(user_id, body.query, nl_response.sql_query)
    except Exception:
        pass

    return {
        "sql": nl_response.sql_query,
        "explanation": nl_response.explanation,
        "confidence": nl_response.confidence,
        "caveats": nl_response.caveats,
        "follow_up_questions": nl_response.follow_up_questions,
        "operation_type": "SELECT",
        "requires_confirmation": False,
        "data": query_results,
        "insights": insights
    }


@router.post("/execute-mutation")
@limiter.limit("10/minute")
async def execute_mutation(request: Request, body: MutationConfirmRequest):
    """
    Executes a data-modifying statement (INSERT/UPDATE/DELETE/DROP) that the
    user has explicitly confirmed after seeing a warning in the UI. This is
    the ONLY path in the app that can mutate data via natural language —
    /ask never executes mutations directly.
    """
    user_id = _get_user_id(request)
    services = _get_user_services(user_id)

    operation = SQLValidator.validate_mutation_query(body.sql)

    if operation == "DROP":
        # Reuse the same safe, existence-checked drop path (and metadata
        # cleanup) as the Data Explorer's delete-table button, instead of
        # executing an arbitrary DROP statement directly.
        match = re.search(r'DROP\s+TABLE\s+["`\[]?(\w+)["`\]]?', body.sql, re.IGNORECASE)
        if not match:
            raise HTTPException(status_code=400, detail="Couldn't determine which table to drop from this statement.")
        table_name = match.group(1)
        services["db_inspector"].drop_table(table_name)
        try:
            metadata_store.unregister_uploaded_table(user_id, table_name)
            metadata_store.delete_relationships_for_table(user_id, table_name)
            metadata_store.delete_dashboard_config(user_id, table_name)
        except Exception:
            pass
        return {"success": True, "operation_type": "DROP", "table_dropped": table_name}

    result = services["query_engine"].execute_mutation(body.sql)
    try:
        metadata_store.add_history(user_id, f"[{operation}] (confirmed)", body.sql)
    except Exception:
        pass
    return {"success": True, "operation_type": operation, "rows_affected": result["rows_affected"]}


@router.post("/export")
@limiter.limit("20/minute")
async def export_query(request: Request, body: ExportRequest):
    """
    Re-runs a (previously validated) SQL query and streams it back as a
    styled, multi-sheet .xlsx file — with a native embedded chart when the
    data shape supports it.
    """
    user_id = _get_user_id(request)
    services = _get_user_services(user_id)

    SQLValidator.validate_query(body.sql)
    query_results = services["query_engine"].execute_query(body.sql)
    df = query_results["dataframe"]

    excel_bytes = ExcelExporter.export_to_excel(df)

    return StreamingResponse(
        excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=finpilot_export.xlsx"}
    )


# ============================================================
# Schema / tables
# ============================================================

@router.get("/schema")
@limiter.limit("30/minute")
async def get_schema(request: Request):
    services = _get_user_services(_get_user_id(request))
    services["db_inspector"].refresh_schema()
    return services["db_inspector"].get_schema_summary()


@router.delete("/schema/{table_name}")
@limiter.limit("15/minute")
async def delete_table(request: Request, table_name: str):
    user_id = _get_user_id(request)
    services = _get_user_services(user_id)
    services["db_inspector"].drop_table(table_name)
    try:
        metadata_store.unregister_uploaded_table(user_id, table_name)
        metadata_store.delete_relationships_for_table(user_id, table_name)
        metadata_store.delete_dashboard_config(user_id, table_name)
    except Exception:
        pass
    return {"deleted": table_name}


@router.post("/upload")
@limiter.limit("10/minute")
async def upload_csv(request: Request, files: List[UploadFile] = File(...)):
    """
    Accepts one or more CSVs, writes each as a new queryable table. Files
    that can't power the Dashboard (no numeric column) still upload
    successfully — they're just flagged as chat-only.
    """
    user_id = _get_user_id(request)
    services = _get_user_services(user_id)

    results = []
    for file in files:
        file_bytes = await file.read()
        try:
            result = process_csv_upload(services["db_url"], file.filename, file_bytes)
            metadata_store.register_uploaded_table(
                user_id, result["table_name"], file.filename,
                dashboard_eligible=result["dashboard_eligible"],
                ineligible_reason=result["ineligible_reason"],
            )
            results.append({"filename": file.filename, "ok": True, **result})
        except HTTPException as e:
            results.append({"filename": file.filename, "ok": False, "error": e.detail})

    services["db_inspector"].refresh_schema()
    return {"results": results}


@router.get("/uploaded-tables")
@limiter.limit("30/minute")
async def get_uploaded_tables(request: Request):
    return {"tables": metadata_store.list_uploaded_tables(_get_user_id(request))}


# ============================================================
# Relationships (for the schema canvas)
# ============================================================

@router.get("/relationships")
@limiter.limit("30/minute")
async def get_relationships(request: Request):
    return {"relationships": metadata_store.list_relationships(_get_user_id(request))}


@router.post("/relationships")
@limiter.limit("20/minute")
async def create_relationship(request: Request, body: RelationshipRequest):
    user_id = _get_user_id(request)
    analytics_engine = _get_user_services(user_id)["analytics_engine"]
    # Validate both sides actually exist before persisting a relationship —
    # same principle as every other place we touch table/column names.
    analytics_engine._validate_columns(body.table_a, [body.column_a])
    analytics_engine._validate_columns(body.table_b, [body.column_b])
    rel_id = metadata_store.add_relationship(user_id, body.table_a, body.column_a, body.table_b, body.column_b)
    return {"id": rel_id}


@router.delete("/relationships/{rel_id}")
@limiter.limit("20/minute")
async def delete_relationship(request: Request, rel_id: str):
    metadata_store.delete_relationship(_get_user_id(request), rel_id)
    return {"deleted": rel_id}


# ============================================================
# Dashboard config (column mapping)
# ============================================================

@router.get("/dashboard-configs")
@limiter.limit("30/minute")
async def get_dashboard_configs(request: Request):
    return {"configs": metadata_store.list_dashboard_configs(_get_user_id(request))}


@router.post("/dashboard-config")
@limiter.limit("20/minute")
async def set_dashboard_config(request: Request, body: DashboardConfigRequest):
    user_id = _get_user_id(request)
    analytics_engine = _get_user_services(user_id)["analytics_engine"]
    analytics_engine._validate_columns(
        body.table_name, [body.date_col, body.amount_col, body.category_col, body.entity_col]
    )
    metadata_store.save_dashboard_config(
        user_id=user_id,
        table_name=body.table_name,
        date_col=body.date_col,
        amount_col=body.amount_col,
        category_col=body.category_col,
        entity_col=body.entity_col,
        label=body.label or body.table_name,
        make_active=True,
    )
    return {"ok": True}


@router.get("/dashboard")
@limiter.limit("30/minute")
async def get_dashboard(request: Request):
    user_id = _get_user_id(request)
    analytics_engine = _get_user_services(user_id)["analytics_engine"]
    try:
        return analytics_engine.get_dashboard_data(user_id)
    except HTTPException:
        raise
    except Exception as e:
        if "no such table" in str(e).lower():
            raise HTTPException(
                status_code=503,
                detail="The configured dashboard source no longer exists (its table may have been "
                       "deleted). Go to Data Explorer to set up a new one."
            )
        raise HTTPException(status_code=500, detail=f"Dashboard error: {str(e)}")


# ============================================================
# History / explain / correlations / forecast / share / report
# ============================================================

@router.get("/history")
@limiter.limit("30/minute")
async def get_history(request: Request):
    return {"history": metadata_store.list_history(_get_user_id(request))}


@router.delete("/history")
@limiter.limit("10/minute")
async def clear_history_route(request: Request):
    metadata_store.clear_history(_get_user_id(request))
    return {"ok": True}


@router.post("/explain-chart")
@limiter.limit("15/minute")
async def explain_chart(request: Request, body: ExplainChartRequest):
    explanation = await insights_engine.explain_chart(body.chart_title, body.data)
    return {"explanation": explanation}


@router.get("/correlations")
@limiter.limit("30/minute")
async def get_correlations(request: Request, table_name: Optional[str] = None):
    user_id = _get_user_id(request)
    analytics_engine = _get_user_services(user_id)["analytics_engine"]
    return analytics_engine.find_correlations(user_id, table_name)


@router.post("/forecast")
@limiter.limit("30/minute")
async def get_forecast(request: Request, body: ForecastRequest):
    user_id = _get_user_id(request)
    analytics_engine = _get_user_services(user_id)["analytics_engine"]
    return analytics_engine.forecast_series(user_id, body.table_name, body.date_col, body.value_col, body.periods)


@router.post("/share")
@limiter.limit("20/minute")
async def share_result(request: Request, body: ShareRequest):
    share_id = metadata_store.create_share(body.title, body.payload)
    return {"share_id": share_id}


@router.get("/share/{share_id}")
@limiter.limit("60/minute")
async def get_shared_result(request: Request, share_id: str):
    result = metadata_store.get_share(share_id)
    if not result:
        raise HTTPException(status_code=404, detail="This shared link doesn't exist or has expired.")
    return result


@router.get("/report")
@limiter.limit("5/minute")
async def get_report(request: Request):
    user_id = _get_user_id(request)
    analytics_engine = _get_user_services(user_id)["analytics_engine"]
    dashboard_data = analytics_engine.get_dashboard_data(user_id)
    pdf_bytes = await generate_report(dashboard_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=finpilot_report.pdf"}
    )


# ============================================================
# Visit tracking + admin stats ("how many people used my app")
# ============================================================

def _hash_ip(request: Request) -> str:
    # Render (and most hosts) sit behind a proxy, so the real client IP is
    # in X-Forwarded-For, not request.client.host. Hashed (not stored raw)
    # since this is just for rough unique-visitor counting, not tracking
    # individuals.
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


@router.post("/track-visit")
@limiter.limit("30/minute")
async def track_visit(request: Request):
    """
    Public, unauthenticated endpoint — called once when the app loads in a
    browser, before/regardless of login, so visits from people who never
    sign in still get counted.
    """
    try:
        metadata_store.record_page_view(_hash_ip(request), request.headers.get("user-agent", "")[:300])
    except Exception:
        pass
    return {"ok": True}


@router.get("/admin/stats")
@limiter.limit("20/minute")
async def admin_stats(request: Request):
    admin_key = request.headers.get("X-Admin-Key", "")
    if not settings.ADMIN_KEY or admin_key != settings.ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing admin key.")
    return metadata_store.get_admin_stats()
