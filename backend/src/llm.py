import os
import httpx
from fastapi import HTTPException
import dotenv
from loguru import logger
import io
import json
from typing import List, Dict, Any

from . import prompt

dotenv.load_dotenv()


# ---------------------------------------------------------------------------
# Lazy initialization: do NOT crash at import time so /api/health works even
# when OPENAI_API_KEY is missing or not yet injected by Railway.
# ---------------------------------------------------------------------------
OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"
OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions"
OPENAI_REALTIME_MODEL = "gpt-4o-realtime-preview"
OPENAI_TRANSCRIPTION_MODEL = "whisper-1"
OPENAI_REALTIME_VOICE = "ballad"
OPENAI_REALTIME_SPEED = 1.35
OPENAI_REALTIME_TIMEOUT = 10.0
OPENAI_TRANSCRIPTION_TIMEOUT = 60.0


def _get_api_key() -> str:
    """Return the OpenAI API key, raising HTTPException if missing."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured. Set it in Railway environment variables.",
        )
    return key


def _get_headers() -> dict:
    return {"Authorization": f"Bearer {_get_api_key()}"}

# v0.2.0 — Domain-aware tool activation
# Keys: domain strings + None (legacy / manufacturing have no extras)
# Values: set of tool names to append on top of the TBM base tools.
DOMAIN_TOOL_ACTIVATION: dict = {
    None: set(),
    "manufacturing": set(),
    "construction": {"request_permit"},
    "heavy_industry": {"request_permit", "log_measurement"},
    "semiconductor": {"request_permit", "log_measurement"},
}

# v0.2.0 — Domain STT presets (noise reduction + VAD threshold).
# Based on stt_tuning_plan.md. Legacy (None) keeps v0.1.0 exactly.
DOMAIN_STT_PRESET: dict = {
    None:             {"noise_reduction": "far_field",  "vad_threshold": 0.5},
    "manufacturing":  {"noise_reduction": "near_field", "vad_threshold": 0.6},
    "construction":   {"noise_reduction": "far_field",  "vad_threshold": 0.7},
    "heavy_industry": {"noise_reduction": "far_field",  "vad_threshold": 0.7},
    "semiconductor":  {"noise_reduction": "near_field", "vad_threshold": 0.5},
}

# v0.2.0 — Path to per-domain glossary files (optional; falls back silently).
_GLOSSARY_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "glossary_by_domain.json"
)
try:
    with open(_GLOSSARY_PATH, "r", encoding="utf-8") as _f:
        _GLOSSARY_BY_DOMAIN = json.load(_f)
except FileNotFoundError:
    _GLOSSARY_BY_DOMAIN = {}


def _build_glossary_snippet(domain: str | None) -> str:
    """Return a short bullet list of domain+common terms for prompt injection."""
    if not _GLOSSARY_BY_DOMAIN:
        return ""
    domains = _GLOSSARY_BY_DOMAIN.get("domains", {})
    common = _GLOSSARY_BY_DOMAIN.get("common", [])
    terms = []
    if domain and domain in domains:
        terms.extend(domains[domain])
    terms.extend(common)
    if not terms:
        return ""
    bullets = []
    for t in terms[:40]:  # token budget cap
        ko = t.get("term_ko", "")
        en = t.get("term_en", "")
        bullets.append(f"- {ko} ({en})" if en else f"- {ko}")
    return "Domain vocabulary (preserve exact spellings):\n" + "\n".join(bullets)


async def generate_webrtc_key(
    mode: str = "tbm",
    language: str = "korean",
    domain: str | None = None,
) -> str:
    # Select prompt and tools based on mode, language, and (optional) domain.
    # Backward compat: domain=None keeps the v0.1.0 behavior exactly.
    try:
        instructions = prompt.get_system_prompt(mode, language, domain)
    except TypeError:
        # get_system_prompt not yet updated (PR #3 in-flight) — fall back.
        instructions = prompt.get_system_prompt(mode, language)

    # v0.2.0 — Append per-domain glossary snippet to boost STT term recognition.
    glossary_snippet = _build_glossary_snippet(domain)
    if glossary_snippet:
        instructions = instructions + "\n\n" + glossary_snippet

    # v0.2.0 — Domain STT preset (noise reduction + VAD threshold).
    stt_preset = DOMAIN_STT_PRESET.get(domain, DOMAIN_STT_PRESET[None])

    EHS_TOOLS_NAMES = ["retrieve_documents", "display_document_citations"]

    if mode == "ehs":
        tools = [tool for tool in prompt.TOOLS_SCHEMA if tool["name"] in EHS_TOOLS_NAMES]
    else:
        base = [tool for tool in prompt.TOOLS_SCHEMA if tool["name"] not in EHS_TOOLS_NAMES]
        extra_names = DOMAIN_TOOL_ACTIVATION.get(domain, set())
        domain_tools_schema = getattr(prompt, "DOMAIN_TOOLS_SCHEMA", [])
        extras = [t for t in domain_tools_schema if t["name"] in extra_names]
        tools = base + extras
    
    headers = _get_headers()

    async with httpx.AsyncClient() as client:
        session_config = {
            "model": OPENAI_REALTIME_MODEL,
            "voice": OPENAI_REALTIME_VOICE,
            "input_audio_noise_reduction": {
                "type": stt_preset["noise_reduction"],
            },
            "input_audio_transcription": {
                "model": OPENAI_TRANSCRIPTION_MODEL,
            },
            "modalities": ["audio", "text"],
            "instructions": instructions,
            "speed": OPENAI_REALTIME_SPEED,
            "turn_detection": {
                "type": "server_vad",
                "threshold": stt_preset["vad_threshold"],
            },
        }
        
        # Only add tools if any are available
        if tools:
            session_config["tool_choice"] = "auto"
            session_config["tools"] = tools
        
        resp = await client.post(
            OPENAI_REALTIME_SESSIONS_URL,
            headers=headers,
            json=session_config,
            timeout=OPENAI_REALTIME_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.error(resp.text)
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        data = resp.json()
        key = data.get("client_secret", {}).get("value")
        return key


async def transcribe_audio(
    filename: str,
    file_bytes: bytes,
    content_type: str = 'audio/webm',
) -> dict:
    headers = _get_headers()
    files = {'file': (filename, io.BytesIO(file_bytes), content_type)}
    data = {'model': OPENAI_TRANSCRIPTION_MODEL}
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            OPENAI_TRANSCRIPTION_URL,
            headers=headers,
            data=data,
            files=files,
            timeout=OPENAI_TRANSCRIPTION_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.error(resp.text)
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        data = resp.json()
        return data


# ---------------------------------------------------------------------------
# Lazy-load the guideline data (22 MB) — only when first API call needs it.
# ---------------------------------------------------------------------------
_documents: List[Dict[str, Any]] | None = None


def _get_documents() -> List[Dict[str, Any]]:
    global _documents
    if _documents is None:
        data_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'guideline-summary.json')
        logger.info(f"Loading guideline data from {data_path}...")
        with open(data_path, 'r', encoding='utf-8') as f:
            _documents = json.load(f)
            for doc in _documents:
                keywords = doc.get('keywords', [])
                keywords = [kw.lower().replace(' ', '').strip() for kw in keywords]
                doc['keywords'] = keywords
        logger.info(f"Loaded {len(_documents)} guideline documents.")
    return _documents

async def retrieve_documents(query: str, top_k: int = 4) -> List[Dict[str, Any]]:
    """
    Retrieve relevant documents using TF-IDF-like scoring on keywords.
    
    Args:
        query: User query string
        top_k: Number of documents to return
        
    Returns:
        List of relevant documents with title, id, url, content, and relevance score
    """
    logger.info(f"📝 Starting document retrieval for query: '{query}'")
    
    if not query.strip():
        return []
    
    documents = _get_documents()

    # Calculate document scores using TF-IDF-like approach
    doc_scores = []
    total_docs = len(documents)
    
    logger.info(f"📊 Starting TF-IDF scoring for {total_docs} documents")
    
    # Calculate document frequency for each keyword
    keyword_doc_freq = {}
    for doc in documents:
        doc_keywords = doc.get('keywords', [])
        unique_keywords = set(doc_keywords)
        for keyword in unique_keywords:
            keyword_doc_freq[keyword] = keyword_doc_freq.get(keyword, 0) + 1
    
    logger.info(f"📈 Calculated document frequencies for {len(keyword_doc_freq)} unique keywords")
    
    # Score each document
    scored_docs = 0
    for doc in documents:
        score = calculate_document_score(doc, query, keyword_doc_freq, total_docs)
        if score > 0:
            doc_scores.append({
                'title': doc.get('title', ''),
                'id': doc.get('id', ''),
                'url': doc.get('url', ''),
                'content': doc.get('content', ''),
                'score': score,
                'keywords': doc.get('keywords', [])
            })
            scored_docs += 1

            title = doc.get('title', '')
            keywords = doc.get('keywords', [])
            # print(title, keywords, score)
    
    logger.info(f"✅ Found {scored_docs} documents with relevance scores > 0")
    
    # Sort by score and return top_k
    doc_scores.sort(key=lambda x: x['score'], reverse=True)
    return doc_scores[:top_k]


def calculate_document_score(
    doc: Dict[str, Any],
    query: str,
    keyword_doc_freq: Dict[str, int],
    total_docs: int,
) -> float:
    """
    Calculate TF-IDF-like score for a document given query keywords.
    """
    score = 0.0
    for keyword in doc.get('keywords', []):
        if keyword in query.lower().replace(' ', ''):
            score += 1.0 / keyword_doc_freq.get(keyword, 1)
    return score


def calculate_document_score_by_keywords(
    doc: Dict[str, Any],
    keywords: List[str],
    keyword_doc_freq: Dict[str, int],
    total_docs: int,
) -> float:
    """
    Calculate TF-IDF-like score for a document given specific keywords.
    """
    score = 0.0
    doc_keywords = doc.get('keywords', [])
    
    # Check for exact keyword matches
    for search_keyword in keywords:
        for doc_keyword in doc_keywords:
            # Exact match
            a = search_keyword.lower().replace(' ', '').strip()
            b = doc_keyword.lower().replace(' ', '').strip()

            if a == b:
                score += 2.0 / keyword_doc_freq.get(doc_keyword, 1)
            # Partial match (search keyword contains doc keyword or vice versa)
            elif a in b or b in a:
                score += 1.0 / keyword_doc_freq.get(doc_keyword, 1)
    
    return score


async def retrieve_documents_by_keywords(
    keywords: List[str],
    top_k: int = 4,
    domain: str | None = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve relevant documents using TF-IDF-like scoring on provided keywords.

    Args:
        keywords: List of keywords to search for
        top_k: Number of documents to return
        domain: Optional domain hint. If provided and documents carry a 'domain'
                field, matching documents get a 1.3x score boost. Unknown/absent
                domain metadata is ignored (fully backward compatible).

    Returns:
        List of relevant documents with title, id, url, content, and relevance score
    """
    logger.info(f"📝 Starting document retrieval for keywords: {keywords}")
    
    if not keywords or len(keywords) == 0:
        return []
    
    # Normalize keywords to lowercase
    normalized_keywords = [kw.lower().strip() for kw in keywords if kw.strip()]
    if not normalized_keywords:
        return []
    
    documents = _get_documents()

    # Calculate document scores using TF-IDF-like approach
    doc_scores = []
    total_docs = len(documents)
    
    logger.info(f"📊 Starting TF-IDF scoring for {total_docs} documents with keywords: {normalized_keywords}")
    
    # Calculate document frequency for each keyword
    keyword_doc_freq = {}
    for doc in documents:
        doc_keywords = doc.get('keywords', [])
        unique_keywords = set(doc_keywords)
        for keyword in unique_keywords:
            keyword_doc_freq[keyword] = keyword_doc_freq.get(keyword, 0) + 1
    
    logger.info(f"📈 Calculated document frequencies for {len(keyword_doc_freq)} unique keywords")
    
    # Score each document
    scored_docs = 0
    for doc in documents:
        score = calculate_document_score_by_keywords(doc, normalized_keywords, keyword_doc_freq, total_docs)
        # Domain boost (v0.2.0): documents tagged with the requested domain
        # get a 1.3x score. Documents without a 'domain' field are unaffected.
        if domain is not None and score > 0:
            doc_domain = doc.get('domain')
            if doc_domain == domain:
                score *= 1.3
        if score > 0:
            doc_scores.append({
                'title': doc.get('title', ''),
                'id': doc.get('id', ''),
                'url': doc.get('url', ''),
                'content': doc.get('content', ''),
                'score': score,
                'keywords': doc.get('keywords', [])
            })
            scored_docs += 1

            title = doc.get('title', '')
            doc_keywords = doc.get('keywords', [])
            logger.debug(f"Document '{title}' scored {score:.3f} with keywords: {doc_keywords}")
    
    logger.info(f"✅ Found {scored_docs} documents with relevance scores > 0")
    
    # Sort by score and return top_k
    doc_scores.sort(key=lambda x: x['score'], reverse=True)
    return doc_scores[:top_k]