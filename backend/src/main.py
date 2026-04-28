from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
from fastapi import Request
from pydantic import BaseModel
from loguru import logger
import os
from typing import List, Dict, Any, Optional, Literal

from . import llm

app = FastAPI()


# ---------------------------------------------------------------------------
# Health check endpoint (Railway requires this)
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.2.0"}


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

# Serve frontend static files at /static (not /)
# Railway: The frontend dist is at /app/frontend/dist in Docker container
frontend_dist = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
if os.path.isdir(frontend_dist):
    app.mount("/static", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    logger.warning(f"Frontend dist not found at {frontend_dist}")

# Fallback route for SPA: serve index.html for any non-API route
@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    if full_path.startswith("api/"):
        # Let API routes be handled normally
        raise HTTPException(status_code=404, detail="API route not found.")
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
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

    key = await llm.generate_webrtc_key(mode, language, domain)
    return {"key": key}

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
