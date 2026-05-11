from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
from fastapi import Request
from pydantic import BaseModel
import json as _json
from loguru import logger
import os
import time
from collections import deque, defaultdict
from threading import Lock
from typing import List, Dict, Any, Optional, Literal, Deque

from . import llm

app = FastAPI()


# ---------------------------------------------------------------------------
# Health check endpoint (Railway requires this)
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.2.4"}


# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# v0.2.0 — Domain / language policy
# ---------------------------------------------------------------------------
SUPPORTED_LANGUAGES = {"korean", "english", "vietnamese", "thai", "indonesian"}
SUPPORTED_DOMAINS = {"manufacturing", "construction", "heavy_industry", "semiconductor"}
DEPRECATED_LANGUAGES = {"polish"}  # silently folded into "english"

SessionLanguage = Literal["korean", "english", "vietnamese", "thai", "indonesian"]
SessionDomain = Literal["manufacturing", "construction", "heavy_industry", "semiconductor"]
SessionMode = Literal["tbm", "ehs"]


# Request model for webrtc-key endpoint
class WebRTCKeyRequest(BaseModel):
    mode: str = "tbm"
    language: str = "korean"
    domain: Optional[SessionDomain] = None
    # PR A — c7 #1: optional work_type_id from prepare flow. When set the
    # backend prompt builder injects the matching baseline checklist block.
    work_type_id: Optional[str] = None
    # PR A_v2-4 — optional prepare-stage summary derived on the frontend.
    # Shape (loose dict for forward compat):
    #   { work_type_label: str, baseline_count: int,
    #     top_hazards: list[str], context_summary: str }
    # Backend prompt.get_system_prompt injects a [Prepare Stage Result] block
    # only for TBM mode; EHS ignores. Loose dict avoids brittle Pydantic
    # mismatches if the frontend later adds fields.
    prepared_summary: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Phase chat-PR1 — /api/chat (text-only fallback transport).
# - Pydantic models for request body. Mirrors WebRTCKeyRequest meta fields so
#   the same prepare-stage payload reuses the same prompt builder downstream.
# - Server is single source-of-truth for the system prompt; clients send only
#   user/assistant messages. role='system' from the client is silently ignored
#   (defensive — frontend already constrains to user|assistant via Literal).
# - Sliding window enforcement (60 messages = 30 turns) lives in llm.py to
#   keep main.py thin; main.py only validates request shape.
# ---------------------------------------------------------------------------
class ChatRequestMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    mode: Literal["tbm", "ehs"]
    language: str = "korean"
    domain: Optional[SessionDomain] = None
    work_type_id: Optional[str] = None
    # TBM-only — webrtc-key와 동일 shape (loose dict for forward compat).
    prepared_summary: Optional[Dict[str, Any]] = None
    messages: List[ChatRequestMessage]
    # 미래 확장용 — 무시되어도 클라가 깨지지 않도록 옵셔널 dict.
    extras: Optional[Dict[str, Any]] = None


# PR A — c7 #1: work-types catalog list response item
class WorkTypeListItem(BaseModel):
    id: str
    label_ko: str
    label_en: str
    domain: SessionDomain


# PR A — c7 #1: recommend-hazards request/response.
# PR A_v2-1: extended with optional context + refresh_seed (LLM mode).
class RecommendHazardsRequest(BaseModel):
    work_type_id: str
    domain: SessionDomain
    language: SessionLanguage
    # PR A_v2-1: optional user-provided context (worker_count, shift, wind_speed_mps,
    # new_material, special_notes, previous_incident_keywords). Frontend sends
    # this when the leader fills the optional context form (A_v2-3 wires the form).
    context: Optional[Dict[str, Any]] = None
    # PR A_v2-1: nonce — the LLM sees a hint to vary perspective when this is
    # set. Same input + temperature 0.4 still varies output naturally.
    refresh_seed: Optional[int] = None
    # v0.2.4 PR-feedback-2: 2-tier hazard recommendation. Frontend uses the
    # static checklist catalog (build-time synced) as the immediate Tier-1
    # response, then on PrepareContextForm input change (debounce 1.5s) or the
    # "다시 받기" button it calls /api/recommend-hazards with these IDs telling
    # the LLM what the user already sees. The prompt builder injects an
    # "Augmentation Mode" block that instructs the LLM to keep these baseline
    # items AS-IS (same id, same content) and only reorder, refine, or add NEW
    # items the user has not seen yet (id="LLM-COND-*"). Both fields are
    # optional — when None or empty list the prompt builder skips the block
    # entirely, preserving v0.2.3 behavior 1:1 (full backward compat).
    prior_baseline_ids: Optional[List[str]] = None
    prior_conditional_ids: Optional[List[str]] = None


# Note: baseline / conditional / incident_cases items use loose Dict shapes
# rather than nested Pydantic models. Reason: the conditional payload key 'if'
# is a Python reserved word, and Pydantic v2 dropped the v1 `Config.fields`
# alias trick. Loose dicts keep the JSON shape clean ({if, id, content, ...})
# and mirror the on-disk catalog schema 1:1. PR D may tighten this once the
# /api/recommend-hazards contract is stable. PR A_v2-1 adds optional `source`
# label to baseline/conditional/incident_cases items (catalog | llm | llm-placeholder).


class RecommendHazardsResponse(BaseModel):
    """recommend-hazards response.

    PR F (legacy flat arrays — backward compat):
      `scenarios`, `mitigations`, `ppe` are top-level flat arrays of
      `{id, content, source}` items aggregated across all baseline hazards.
      Older clients (and PR F-era clients) read these directly.

    Phase 2.x PR-1 (per-item mapping):
      Each `baseline[i]` MAY now carry its own optional
      `scenarios`, `mitigations`, `ppe` arrays of the same shape — these
      represent the 1:N linkage between a single baseline hazard and the
      scenarios / mitigations / ppe that apply specifically to it.  The
      top-level flat arrays continue to be populated (de-duplicated by id)
      for backward compatibility.  New clients SHOULD prefer the per-item
      arrays inside each baseline; legacy clients keep working off the flat
      arrays unchanged.
    """
    baseline: List[Dict[str, Any]]
    conditional: List[Dict[str, Any]]
    suggested_questions: List[str]
    incident_cases: List[Dict[str, Any]]
    # PR F — flat aggregate arrays. Phase 2.x PR-1 keeps these populated for
    # backward compat (= per-item arrays union, dedup by id).
    scenarios: List[Dict[str, Any]] = []
    mitigations: List[Dict[str, Any]] = []
    ppe: List[Dict[str, Any]] = []
    # PR A_v2-1: optional metadata so the frontend can surface refresh state.
    seed_revision: Optional[str] = None
    generated_at: Optional[str] = None


# ---------------------------------------------------------------------------
# PR A_v2-1 — In-memory sliding-window rate limit for /api/recommend-hazards.
# felix decision §12-#8: 5 calls / 60s / session. Session key is best-effort
# (X-Forwarded-For first, fallback client.host) + work_type_id, since the app
# does not pass a real session id to the endpoint.  Single process only — Railway
# horizontal scaling would need Redis here; PR A_v2-1 explicitly stays in-memory.
# ---------------------------------------------------------------------------
_RECOMMEND_RATE_WINDOW_SECONDS = 60.0
_RECOMMEND_RATE_LIMIT = 5
_recommend_rate_lock = Lock()
_recommend_rate_buckets: Dict[str, Deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """Pick the client IP best-effort. Honors X-Forwarded-For for proxy chains."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip() or "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _check_recommend_rate_limit(session_key: str) -> None:
    """Sliding-window check. Raises 429 when the bucket exceeds the limit.
    Mutates the bucket: appends the current timestamp on success."""
    now = time.monotonic()
    cutoff = now - _RECOMMEND_RATE_WINDOW_SECONDS
    with _recommend_rate_lock:
        bucket = _recommend_rate_buckets[session_key]
        # Drop timestamps outside the window.
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= _RECOMMEND_RATE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="분당 5회 초과 — 잠시 후 다시 시도해주세요.",
            )
        bucket.append(now)

# Request model for retrieve endpoint
class RetrieveRequest(BaseModel):
    query: str

# New request model for keywords-based retrieval
class RetrieveKeywordsRequest(BaseModel):
    keywords: List[str]
    domain: Optional[SessionDomain] = None

# Response model for retrieve endpoint
class DocumentResult(BaseModel):
    title: str
    id: str
    url: str
    content: str
    score: float
    keywords: List[str]

class RetrieveResponse(BaseModel):
    documents: List[DocumentResult]
    query: str
    total_found: int

# New response model for keywords-based retrieval
class RetrieveKeywordsResponse(BaseModel):
    documents: List[DocumentResult]
    keywords: List[str]
    total_found: int

# ---------------------------------------------------------------------------
# Frontend static files — served from root /
# Two layouts must work:
#   dev:    test/backend/src/main.py  →  test/frontend/dist           (../../frontend/dist)
#   Docker: /app/src/main.py           →  /app/frontend/dist           (../frontend/dist)
# Try dev first, then Docker.
# ---------------------------------------------------------------------------
def _resolve_frontend_dist() -> str:
    base = os.path.dirname(__file__)
    for rel in (("..", "..", "frontend", "dist"), ("..", "frontend", "dist")):
        path = os.path.normpath(os.path.join(base, *rel))
        if os.path.isdir(path):
            return path
    # default to dev layout for the warning log path
    return os.path.normpath(os.path.join(base, "..", "..", "frontend", "dist"))


frontend_dist = _resolve_frontend_dist()

if os.path.isdir(frontend_dist):
    # Mount /assets for JS/CSS bundles
    assets_dir = os.path.join(frontend_dist, 'assets')
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    logger.info(f"Frontend dist mounted from {frontend_dist}")
else:
    logger.warning(f"Frontend dist not found at {frontend_dist}")


@app.get("/")
async def serve_index():
    """Serve the SPA index.html at root."""
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path, media_type="text/html")
    raise HTTPException(status_code=404, detail="index.html not found.")


def _normalize_language(raw: str) -> str:
    """Polish folds into english (v0.2.0 deprecation). Unknown => 400."""
    lang = raw.lower()
    if lang in DEPRECATED_LANGUAGES:
        logger.warning(f"Deprecated language '{lang}' requested; falling back to 'english'.")
        return "english"
    if lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Language must be one of {sorted(SUPPORTED_LANGUAGES)}"
        )
    return lang


def _normalize_domain(raw: Optional[str]) -> Optional[str]:
    """None or unknown => None (legacy TBM fallback)."""
    if raw is None:
        return None
    if raw not in SUPPORTED_DOMAINS:
        logger.warning(f"Unknown domain '{raw}' requested; falling back to None (legacy).")
        return None
    return raw


@app.post("/api/webrtc-key")
async def generate_webrtc_key(request: WebRTCKeyRequest):
    # Validate mode parameter
    mode = request.mode.lower()
    if mode not in ("tbm", "ehs"):
        raise HTTPException(status_code=400, detail="Mode must be 'tbm' or 'ehs'")

    language = _normalize_language(request.language)
    domain = _normalize_domain(request.domain)
    # PR A: work_type_id is optional, free-form (catalog lookup happens in llm.py).
    # Empty string => treat as unset.
    work_type_id = request.work_type_id or None

    # PR A_v2-4: forward optional prepared_summary; TBM-only injection enforced
    # downstream in prompt.get_system_prompt (defensive — frontend also gates).
    prepared_summary = request.prepared_summary

    key = await llm.generate_webrtc_key(
        mode,
        language,
        domain,
        work_type_id,
        prepared_summary=prepared_summary,
    )
    return {"key": key}


# ---------------------------------------------------------------------------
# PR A — c7 #1: Work types + recommend-hazards endpoints (static catalog).
# Phase 2.1 will replace the static lookup with vector retrieval.
# ---------------------------------------------------------------------------
@app.get("/api/work-types", response_model=List[WorkTypeListItem])
async def list_work_types(domain: SessionDomain):
    """Return the work-type list for a domain (used by /tbm/:id/prepare)."""
    items = llm.list_work_types_for_domain(domain)
    return [WorkTypeListItem(**it) for it in items]


@app.post("/api/recommend-hazards", response_model=RecommendHazardsResponse)
async def recommend_hazards(req: RecommendHazardsRequest, request: Request):
    """Return baseline + conditional + suggested questions for a work_type.

    PR A_v2-1: now LLM-driven via llm.recommend_hazards (GPT-4o JSON mode).
    Falls back to the static catalog on any LLM failure (timeout, JSON parse,
    schema violation). Rate-limited at 5 calls / 60s / (client_ip + work_type_id).

    Failure cases:
      - unknown domain         => 422 (pydantic enforces SessionDomain)
      - unknown work_type_id   => 404
      - rate-limited           => 429
    """
    # Rate limit: client_ip + work_type_id is a stable enough session key for
    # the demo single-process deployment. (Real session id isn't passed here.)
    session_key = f"{_client_ip(request)}::{req.work_type_id}"
    _check_recommend_rate_limit(session_key)

    # Pre-flight: the LLM call accepts missing entries by sending an empty seed,
    # but PR A's contract emits 404 for unknown work_type_id so the frontend
    # surface stays consistent.
    entry = llm.get_work_type_entry(req.domain, req.work_type_id)
    if not entry:
        raise HTTPException(
            status_code=404,
            detail=f"work_type_id '{req.work_type_id}' not found in domain '{req.domain}'",
        )

    result = await llm.recommend_hazards(
        domain=req.domain,
        work_type_id=req.work_type_id,
        language=req.language,
        context=req.context,
        refresh_seed=req.refresh_seed,
        # v0.2.4 PR-feedback-2 — Tier-2 augmentation IDs (None/[] => no-op).
        prior_baseline_ids=req.prior_baseline_ids,
        prior_conditional_ids=req.prior_conditional_ids,
    )
    if result is None:
        # Defensive: should not happen because we already checked entry above.
        raise HTTPException(
            status_code=404,
            detail=f"work_type_id '{req.work_type_id}' not found in domain '{req.domain}'",
        )
    return RecommendHazardsResponse(**result)

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    file_bytes = await file.read()
    data = await llm.transcribe_audio(file.filename, file_bytes, file.content_type)
    return data

@app.post("/api/retrieve", response_model=RetrieveResponse)
async def retrieve_documents(request: RetrieveRequest):
    """
    Retrieve relevant documents based on the query using TF-IDF-like scoring.
    Returns the top 10 most relevant documents with their titles, IDs, URLs, and scores.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    results = await llm.retrieve_documents(request.query, top_k=4)

    documents = [
        DocumentResult(
            title=doc["title"],
            id=doc["id"],
            url=doc["url"],
            content=doc["content"],
            score=doc["score"],
            keywords=doc["keywords"]
        )
        for doc in results
    ]

    return RetrieveResponse(
        documents=documents,
        query=request.query,
        total_found=len(documents)
    )

@app.post("/api/retrieve-keywords", response_model=RetrieveKeywordsResponse)
async def retrieve_documents_by_keywords(request: RetrieveKeywordsRequest):
    """
    Retrieve relevant documents based on keywords using TF-IDF-like scoring.
    Returns the top 10 most relevant documents with their titles, IDs, URLs, and scores.
    """
    if not request.keywords or len(request.keywords) == 0:
        raise HTTPException(status_code=400, detail="Keywords cannot be empty")

    domain = _normalize_domain(request.domain)
    results = await llm.retrieve_documents_by_keywords(
        request.keywords,
        top_k=4,
        domain=domain,
    )

    documents = [
        DocumentResult(
            title=doc["title"],
            id=doc["id"],
            url=doc["url"],
            content=doc["content"],
            score=doc["score"],
            keywords=doc["keywords"]
        )
        for doc in results
    ]

    return RetrieveKeywordsResponse(
        documents=documents,
        keywords=request.keywords,
        total_found=len(documents)
    )


# ---------------------------------------------------------------------------
# PR C (Phase 2.0 MVP, c5 §5/§6) — /api/vision-analyze multipart endpoint.
# Single image (image/jpeg|png|webp, max 5 MB) -> GPT-4o vision JSON output.
# Failure (timeout/HTTP/parse) collapses to empty hazards fallback (handled in
# llm.analyze_image) so the frontend always renders a valid HazardResultCard.
# ---------------------------------------------------------------------------
_VISION_MAX_BYTES = 5 * 1024 * 1024
_VISION_ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}


@app.post("/api/vision-analyze")
async def vision_analyze(
    image: UploadFile = File(...),
    domain: Optional[str] = Form(None),
    language: str = Form("korean"),
    context_messages: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
):
    """Analyze a single field photograph for safety hazards.

    Body (multipart/form-data):
      - image: file (image/jpeg|png|webp, max 5 MB)
      - domain: SessionDomain | "" (optional; legacy fallback)
      - language: SessionLanguage (default "korean")
      - context_messages: JSON-array string (optional)
      - caption: free-form caption (optional)
    """
    # ── mime + size guards ─────────────────────────────────────────────
    mime = (image.content_type or "").lower()
    if mime not in _VISION_ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail="지원 형식: JPEG / PNG / WebP",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="이미지 본문이 비어 있습니다.")
    if len(image_bytes) > _VISION_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="이미지는 최대 5 MB까지 허용됩니다.",
        )

    # ── domain + language normalization (graceful fallback) ────────────
    norm_domain = _normalize_domain(domain) if domain else None
    try:
        norm_language = _normalize_language(language)
    except HTTPException:
        # vision-analyze is non-critical — fall back to korean rather than 400.
        logger.warning(
            f"vision_analyze: unsupported language '{language}' — falling back to korean."
        )
        norm_language = "korean"

    # ── delegate (never raises — falls back to empty hazards on errors) ─
    return await llm.analyze_image(
        image_bytes=image_bytes,
        mime=mime,
        domain=norm_domain,
        language=norm_language,
        context_messages=context_messages,
        caption=caption,
    )


# ---------------------------------------------------------------------------
# Phase chat-PR1 — POST /api/chat (text-only fallback transport).
#
# Returns SSE stream:
#   event: delta       data: {"text": "..."}
#   event: done        data: {"finish_reason": "stop"}
#   event: error       data: {"code": "...", "message": "..."}
#
# Pre-stream validation errors (422 / 413 / 400) return JSON, not SSE — the
# client must handle both paths (chat_mode_plan.md §1.5).
# ---------------------------------------------------------------------------
_CHAT_TOTAL_CHARS_LIMIT = 80_000


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """Chat-completions stream for users whose voice transport is blocked.

    Validates request shape, delegates system-prompt build + sliding window
    + OpenAI streaming to llm.chat_completion, and serializes each yielded
    {event, data} tuple as one SSE block. The producer is responsible for
    emitting an explicit `error` event on failure — this handler does not
    swallow exceptions silently.
    """
    # ── input validation ───────────────────────────────────────────────
    if not request.messages:
        raise HTTPException(status_code=422, detail="messages must not be empty.")
    if request.messages[-1].role != "user":
        raise HTTPException(
            status_code=422,
            detail="last message must have role='user'.",
        )
    total_chars = sum(len(m.content) for m in request.messages)
    if total_chars > _CHAT_TOTAL_CHARS_LIMIT:
        raise HTTPException(
            status_code=413,
            detail=f"messages total length exceeds {_CHAT_TOTAL_CHARS_LIMIT} chars.",
        )

    # mode normalization (Literal["tbm","ehs"] already filters most, but
    # defensive lower() for forward compat).
    mode = request.mode.lower()
    if mode not in ("tbm", "ehs"):
        raise HTTPException(status_code=400, detail="Mode must be 'tbm' or 'ehs'")

    language = _normalize_language(request.language)
    domain = _normalize_domain(request.domain)
    work_type_id = request.work_type_id or None

    # Drop client-sent role='system' just in case (Literal already excludes it,
    # but pydantic_v2 may coerce on subclassed payloads in the future).
    user_messages: List[Dict[str, Any]] = [
        {"role": m.role, "content": m.content}
        for m in request.messages
        if m.role in ("user", "assistant")
    ]

    async def _sse_producer():
        try:
            async for evt in llm.chat_completion(
                mode=mode,
                language=language,
                domain=domain,
                work_type_id=work_type_id,
                prepared_summary=request.prepared_summary,
                messages=user_messages,
            ):
                event_name = evt.get("event", "delta")
                data = evt.get("data", {})
                payload = _json.dumps(data, ensure_ascii=False)
                yield f"event: {event_name}\ndata: {payload}\n\n".encode("utf-8")
        except Exception as exc:  # last-resort guard
            logger.exception(f"chat_endpoint: unexpected error: {exc!r}")
            err_payload = _json.dumps(
                {"code": "internal", "message": "내부 오류가 발생했습니다."},
                ensure_ascii=False,
            )
            yield f"event: error\ndata: {err_payload}\n\n".encode("utf-8")

    return StreamingResponse(
        _sse_producer(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# SPA fallback — must stay LAST so concrete /api/* routes register first.
# ---------------------------------------------------------------------------
@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    """Serve static files from dist, or fallback to index.html for SPA routes."""
    # Skip API routes
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found.")

    # Try to serve the exact file from dist (e.g. circle.gif, vite.svg)
    file_path = os.path.join(frontend_dist, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)

    # SPA fallback: serve index.html for client-side routes
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path, media_type="text/html")
    raise HTTPException(status_code=404, detail="Not found.")
