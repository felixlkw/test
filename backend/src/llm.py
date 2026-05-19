import asyncio
import base64
import os
import httpx
from fastapi import HTTPException
from loguru import logger
import io
import json
import time
from datetime import datetime, timezone
from typing import List, Dict, Any, AsyncIterator, Optional

# Load .env for local development; skip silently on Railway (no .env file)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from . import prompt


# ---------------------------------------------------------------------------
# Lazy initialization: do NOT crash at import time so /api/health works even
# when OPENAI_API_KEY is missing or not yet injected by Railway.
# ---------------------------------------------------------------------------
OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"
OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions"
OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_REALTIME_MODEL = "gpt-realtime-1.5"
OPENAI_TRANSCRIPTION_MODEL = "whisper-1"
OPENAI_CHAT_MODEL = "gpt-4o"
# Phase chat-PR1 — text-only fallback transport. Per chat_mode_prompt_adaptation §E,
# the default model is gpt-4o-mini (cost優先 + 1~3문단 chat 응답 품질 충분).
# Operators can override per-call via chat_completion(model=...).
OPENAI_CHAT_MINI_MODEL = "gpt-4o-mini"
OPENAI_REALTIME_VOICE = "ballad"
OPENAI_REALTIME_SPEED = 1.35
OPENAI_REALTIME_TIMEOUT = 10.0
OPENAI_TRANSCRIPTION_TIMEOUT = 60.0
# PR A_v2-1 — chat-completions for /api/recommend-hazards (JSON mode).
# 2026-05-06 felix HITL: quota 정상화 후 직접 호출 검증으로 두 가지 부족 발견 →
#   1) timeout 15s — 실제 GPT-4o latency가 25~35s (cached_tokens 적중에도 32s 관측).
#      매 호출이 ReadTimeout로 fallback에 빠져 LLM 출력이 사실상 미사용 상태였음.
#      처음 45s로 인상했으나 실측 43.3s가 한계 근접 → 60s로 한 번 더 인상.
#   2) max_tokens 1500 — 실제 completion_tokens 2100+ 필요(baseline 5~6 + per-item
#      scenarios/mitigations/ppe + conditional 1~2 + suggested_questions 4~6 +
#      incident_cases 1~3 의 JSON 직렬화). 1500에서 잘려 JSONDecodeError.
#      4000으로 인상해 풀 응답 + 마진 확보. 비용 영향 미미 — output 토큰만, 호출당 +0.005~$0.01.
# PrepareScreen "다시 받기" UX는 클라 측 spinner로 latency 흡수.
OPENAI_CHAT_TIMEOUT = 60.0
OPENAI_CHAT_TEMPERATURE = 0.4
OPENAI_CHAT_MAX_TOKENS = 4000


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


# Map session language -> glossary entry "language" code (matches glossary_by_domain.json).
_GLOSSARY_LANG_CODE_MAP: dict = {
    "korean": "ko",
    "english": "en",
    "vietnamese": "vi",
    "thai": "th",
    "indonesian": "id",
}


# PR G — STT prompt language code map (ISO-639-1) for OpenAI Realtime
# `input_audio_transcription.language`. Forces Whisper to skip auto-detect, which
# was misclassifying short Korean utterances as English (felix dx: "Which we?",
# "Jesta.", "well"). Default to "ko" for unknown languages — the canonical
# session language for the SafeMate harness.
LANG_TO_CODE: dict = {
    "korean": "ko",
    "english": "en",
    "vietnamese": "vi",
    "thai": "th",
    "indonesian": "id",
}


# PR G — `input_audio_transcription.prompt` is capped at 240 tokens by Whisper.
# 1 ko char ≈ 1 token; English ≈ 0.3 tokens/char. We keep the assembled prompt
# under ~600 chars so even worst-case ko stays well below the limit.
_TRANSCRIPTION_PROMPT_MAX_CHARS = 600
_TRANSCRIPTION_PROMPT_MAX_TERMS = 60


def _build_transcription_prompt(domain: str | None, language: str = "korean") -> str:
    """PR G — Build the Whisper-side `prompt` for `input_audio_transcription`.

    Why this exists (felix dx):
        Glossary terms were only injected into LLM `instructions`, which steers
        the assistant's *output* but does NOT bias Whisper's *input* transcription.
        Whisper's per-request `prompt` parameter (also exposed by Realtime API
        on `input_audio_transcription.prompt`) directly biases recognition for
        domain vocabulary — e.g. "쥐어차" -> "지게차", "입이" -> "길이가".

    Strategy:
      1. Build from `_GLOSSARY_BY_DOMAIN`: domain entries + common.
      2. Prefer entries whose `language` matches the session language; rank
         primary tier by phonetic_hint presence (richer hints mean the term
         is known to be misrecognized — exactly what we want to bias).
      3. Output format depends on session language:
         - korean: "한국어 안전 용어: term1, term2, term3, ..."
         - english/vi/th/id: "Safety terms: en1, en2, en3, ..." with
           Korean term included parenthetically when a Korean transliteration
           helps Whisper preserve cross-lingual technical vocabulary.
      4. Truncate at ~600 chars and ~60 terms.

    Returns "" when the glossary catalog is empty or no terms apply.
    """
    if not _GLOSSARY_BY_DOMAIN:
        return ""
    domains = _GLOSSARY_BY_DOMAIN.get("domains", {})
    common = _GLOSSARY_BY_DOMAIN.get("common", [])
    terms: list = (domains.get(domain, []) if domain else []) + list(common)
    if not terms:
        return ""

    target_code = _GLOSSARY_LANG_CODE_MAP.get(language, "ko")
    primary = [t for t in terms if t.get("language", "ko") == target_code]
    primary_ids = {id(t) for t in primary}
    secondary = [t for t in terms if id(t) not in primary_ids]
    # Rank primary by phonetic_hint presence (more hints -> known mishears -> higher prio).
    primary.sort(key=lambda t: (0 if t.get("phonetic_hint") else 1, -len(t.get("synonyms", []))))
    selected = (primary + secondary)[:_TRANSCRIPTION_PROMPT_MAX_TERMS]

    pieces: list[str] = []
    if language == "korean":
        # Korean session: emit Korean terms directly so Whisper KO model biases them.
        for t in selected:
            ko = t.get("term_ko", "").strip()
            if ko:
                pieces.append(ko)
        header = "한국어 안전 용어: "
    else:
        # Non-Korean sessions: emit English term as primary; Korean as parenthetical
        # when both exist (helps Whisper handle code-switching to KO technical terms).
        for t in selected:
            en = t.get("term_en", "").strip()
            ko = t.get("term_ko", "").strip()
            if en and ko and any(c >= "가" and c <= "힯" for c in ko):
                # KO term in Hangul + EN — useful for code-switched utterances.
                pieces.append(f"{en} ({ko})")
            elif en:
                pieces.append(en)
            elif ko:
                pieces.append(ko)
        header = "Safety terms: "

    if not pieces:
        return ""

    body = ", ".join(pieces)
    full = header + body
    if len(full) > _TRANSCRIPTION_PROMPT_MAX_CHARS:
        # Truncate at term boundary: walk back to the last comma before the cap.
        cap = _TRANSCRIPTION_PROMPT_MAX_CHARS
        cut = full.rfind(", ", 0, cap)
        if cut == -1:
            full = full[:cap]
        else:
            full = full[:cut]
    return full


def _build_glossary_snippet(
    domain: str | None,
    language: str = "korean",
    budget: int = 40,
) -> str:
    """Return a short bullet list of domain+common terms for prompt injection.

    c7 #7 dynamic cap: prefer terms whose `language` matches the session
    language; rank primary tier by synonym richness (more synonyms => more
    likely to need recognition help). Fall back to remaining tiers up to budget.
    Backward compatible: signature accepts old (domain,) call too because the
    extra args have defaults.
    """
    if not _GLOSSARY_BY_DOMAIN:
        return ""
    domains = _GLOSSARY_BY_DOMAIN.get("domains", {})
    common = _GLOSSARY_BY_DOMAIN.get("common", [])
    terms: list = (domains.get(domain, []) if domain else []) + list(common)
    if not terms:
        return ""

    target_code = _GLOSSARY_LANG_CODE_MAP.get(language, "ko")
    primary = [t for t in terms if t.get("language", "ko") == target_code]
    primary_ids = {id(t) for t in primary}
    secondary = [t for t in terms if id(t) not in primary_ids]
    primary.sort(key=lambda t: -len(t.get("synonyms", [])))
    selected = (primary + secondary)[:budget]

    bullets = []
    for t in selected:
        ko = t.get("term_ko", "")
        en = t.get("term_en", "")
        bullets.append(f"- {ko} ({en})" if en else f"- {ko}")
    return "Domain vocabulary (preserve exact spellings):\n" + "\n".join(bullets)


# ---------------------------------------------------------------------------
# c7 #1 — Static checklist catalog. PR A: read-only lookup for prompt baseline
# injection + /api/recommend-hazards. Phase 2.1 will add vector retrieval.
# ---------------------------------------------------------------------------
_CHECKLIST_CATALOG_DIR = os.path.join(
    os.path.dirname(__file__), "..", "data", "checklist_catalog"
)
_CHECKLIST_CATALOG_CACHE: dict[str, dict] = {}


def _load_catalog(domain: str) -> dict | None:
    """Lazy-load and cache a per-domain catalog. Returns None if missing/invalid."""
    if domain in _CHECKLIST_CATALOG_CACHE:
        return _CHECKLIST_CATALOG_CACHE[domain]
    path = os.path.join(_CHECKLIST_CATALOG_DIR, f"{domain}.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _CHECKLIST_CATALOG_CACHE[domain] = data
        return data
    except FileNotFoundError:
        logger.warning(f"checklist catalog not found for domain '{domain}': {path}")
        _CHECKLIST_CATALOG_CACHE[domain] = {}
        return None
    except Exception as exc:
        logger.error(f"checklist catalog load failed for '{domain}': {exc}")
        _CHECKLIST_CATALOG_CACHE[domain] = {}
        return None


def get_work_type_entry(domain: str, work_type_id: str) -> dict | None:
    """Look up a single work_type record. Returns None if missing."""
    catalog = _load_catalog(domain)
    if not catalog:
        return None
    work_types = catalog.get("work_types", {}) or {}
    return work_types.get(work_type_id)


def list_work_types_for_domain(domain: str) -> list[dict]:
    """Return [{id,label_ko,label_en,domain}, ...] for the prepare-mode catalog UI."""
    catalog = _load_catalog(domain)
    if not catalog:
        return []
    work_types = catalog.get("work_types", {}) or {}
    out = []
    for wt_id, entry in work_types.items():
        out.append({
            "id": wt_id,
            "label_ko": entry.get("label_ko", wt_id),
            "label_en": entry.get("label_en", wt_id),
            "domain": domain,
        })
    return out


def _seed_revision_for_domain(domain: str | None) -> str:
    """Build a simple seed_revision string from the catalog file mtime.

    Format: "v0.2.0-<epoch_seconds>". Used by the response so the frontend
    can surface (and later cache against) catalog updates. Returns
    "v0.2.0-unknown" when the file cannot be stat'd (treated as constant).
    """
    if not domain:
        return "v0.2.0-unknown"
    path = os.path.join(_CHECKLIST_CATALOG_DIR, f"{domain}.json")
    try:
        mtime = int(os.path.getmtime(path))
        return f"v0.2.0-{mtime}"
    except OSError:
        return "v0.2.0-unknown"


def _build_baseline_checklist(domain: str | None, work_type_id: str | None) -> str | None:
    """Build the prompt-injection block listing baseline+conditional items.

    Returned as a plain text block to be appended to TBM instructions. The
    prompt rule (BASELINE_CHECKLIST_RULE) tells the assistant to incorporate
    these into its dynamic checklist. None when work_type_id is missing or
    no matching catalog entry exists.
    """
    if not domain or not work_type_id:
        return None
    entry = get_work_type_entry(domain, work_type_id)
    if not entry:
        return None
    label_ko = entry.get("label_ko", work_type_id)
    baseline = entry.get("baseline", []) or []
    conditional = entry.get("conditional", []) or []

    lines: list[str] = []
    lines.append(
        f"Required baseline items (must include in create_dynamic_checklist) for "
        f"work_type='{label_ko}' ({work_type_id}):"
    )
    for b in baseline:
        bid = b.get("id", "")
        content = b.get("content", "")
        reg = b.get("regulation")
        suffix = f" [{reg}]" if reg else ""
        lines.append(f"- {bid}: {content}{suffix}")
    if conditional:
        lines.append(
            "Conditional items (include only when the if-condition matches user's "
            "reported context):"
        )
        for c in conditional:
            cond = c.get("if", "")
            add = c.get("add", {}) or {}
            cid = add.get("id", "")
            ccontent = add.get("content", "")
            lines.append(f"- if {cond} -> {cid}: {ccontent}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# PR A_v2-1 — recommend_hazards: GPT-4o chat completion (JSON mode) with
# the static catalog as authoritative seed + static fallback on any failure.
# ---------------------------------------------------------------------------
def _flatten_seed_conditional(catalog_conditional: list[dict]) -> list[dict]:
    """Flatten the on-disk conditional shape ({if, add:{id, content, regulation?}})
    into the response shape ({if, id, content, regulation?, source}).

    Used to feed the LLM seed payload AND to construct the static fallback.
    """
    out: list[dict] = []
    for c in catalog_conditional or []:
        add = c.get("add", {}) or {}
        out.append({
            "if": c.get("if", ""),
            "id": add.get("id", ""),
            "content": add.get("content", ""),
            "regulation": add.get("regulation"),
            "source": "catalog",
        })
    return out


def _seeded_baseline_with_source(catalog_baseline: list[dict]) -> list[dict]:
    """Stamp source='catalog' on each seed baseline item (preserves all keys).

    Phase 2.x PR-1: also propagate per-item scenarios/mitigations/ppe from the
    on-disk catalog (when present) and stamp source='catalog' on those items
    too — so the static fallback path delivers the same per-item shape as the
    LLM success path.
    """
    out: list[dict] = []
    for b in catalog_baseline or []:
        item = {k: v for k, v in b.items()}
        item["source"] = "catalog"
        bid = b.get("id") or ""
        # Splice per-item arrays from the catalog when present. Each per-item
        # entry inherits source='catalog' since it came from the on-disk file.
        for key, default_source in (
            ("scenarios", f"{bid}-sc"),
            ("mitigations", f"{bid}-mit"),
            ("ppe", f"{bid}-ppe"),
        ):
            raw = b.get(key)
            normalized: list[dict] = []
            if isinstance(raw, list):
                for entry in raw:
                    if not isinstance(entry, dict):
                        continue
                    content = entry.get("content")
                    if not isinstance(content, str) or not content.strip():
                        continue
                    normalized.append({
                        "id": str(entry.get("id") or "").strip()
                        or f"{default_source.upper()}-{len(normalized) + 1}",
                        "content": content.strip(),
                        "source": "catalog",
                    })
            item[key] = normalized
        out.append(item)
    return out


def _fallback_recommend_response(
    catalog_baseline: list[dict],
    catalog_conditional: list[dict],
    seed_questions: list[str],
    seed_revision: str,
) -> dict:
    """Build the static-fallback response shape (also returned on LLM failure).

    Phase 2.x PR-1: when the on-disk catalog carries per-item scenarios /
    mitigations / ppe inside each baseline (added in PR-1 §F), splice those
    into the per-item baseline AND aggregate (de-duplicated by id) into the
    legacy top-level flat arrays for backward compat. When the catalog has
    no per-item data, the flat arrays stay empty as in PR F.
    """
    seeded = _seeded_baseline_with_source(catalog_baseline)
    # Aggregate per-item arrays into the flat top-level arrays (backward compat
    # for PR F clients that only read flat fields).
    flat_scen: list[dict] = []
    flat_mit: list[dict] = []
    flat_ppe: list[dict] = []
    seen_scen: set = set()
    seen_mit: set = set()
    seen_ppe: set = set()
    for b in seeded:
        for entry in b.get("scenarios") or []:
            eid = entry.get("id")
            if eid and eid not in seen_scen:
                flat_scen.append(entry)
                seen_scen.add(eid)
        for entry in b.get("mitigations") or []:
            eid = entry.get("id")
            if eid and eid not in seen_mit:
                flat_mit.append(entry)
                seen_mit.add(eid)
        for entry in b.get("ppe") or []:
            eid = entry.get("id")
            if eid and eid not in seen_ppe:
                flat_ppe.append(entry)
                seen_ppe.add(eid)
    return {
        "baseline": seeded,
        "conditional": _flatten_seed_conditional(catalog_conditional),
        "suggested_questions": list(seed_questions or []),
        "incident_cases": [],
        # PR F flat arrays — Phase 2.x PR-1: aggregate from per-item catalog.
        "scenarios": flat_scen,
        "mitigations": flat_mit,
        "ppe": flat_ppe,
        "seed_revision": seed_revision,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _build_fallback_seed_questions(catalog_baseline: list[dict]) -> list[str]:
    """Tiny Korean confirmation pattern fallback (mirrors main._build_suggested_questions).

    Used only when LLM fails AND we want at least one starter question. PR A's
    /api/recommend-hazards built these in main.py; v2-1 moves the fallback here
    so llm.recommend_hazards is a single source of truth.
    """
    out: list[str] = []
    for item in (catalog_baseline or [])[:4]:
        c = (item.get("content") or "").strip()
        if not c:
            continue
        out.append(f"{c} 확인하셨나요?")
    if not out:
        out.append("작업 전 안전 점검은 모두 완료하셨나요?")
    return out


async def recommend_hazards(
    domain: str | None,
    work_type_id: str,
    language: str,
    context: dict | None = None,
    refresh_seed: int | None = None,
    prior_baseline_ids: list[str] | None = None,
    prior_conditional_ids: list[str] | None = None,
) -> dict:
    """GPT-4o chat completion (JSON mode) for prepare-stage recommendations.

    Behavior (c8 §3 fallback priority):
      1. _load_catalog(domain) -> work_type entry. If domain unknown OR entry
         missing, return None to let the caller emit 404.  Exception: when
         domain is known but work_type_id is missing, we still attempt the LLM
         call with empty seed (per c8 §3 #1) — currently main.py's 404 handles
         the "missing entry" case before reaching here, so this branch is for
         the rare case where the catalog file exists but the work_type key
         isn't in it.
      2. Build the system prompt via prompt.build_recommend_hazards_prompt.
      3. POST to chat/completions with response_format={'type':'json_object'},
         temperature=0.4, max_tokens=1500, timeout=15s.
      4. Validate the response shape; ensure all seed.baseline ids appear in
         the response (re-add missing ones with source='catalog').
      5. On any failure (httpx error, JSON parse, schema validation), log a
         warning and return the static fallback response with everything
         labeled source='catalog'. Same JSON shape as success.

    Returns: dict matching RecommendHazardsResponse. Never raises (failures
    fall through to the static fallback). Returns None only when the catalog
    is missing entirely (unknown domain) — caller emits 404.
    """
    if not domain:
        return None
    catalog = _load_catalog(domain)
    if catalog is None:
        return None

    work_types = catalog.get("work_types", {}) or {}
    entry = work_types.get(work_type_id)

    seed_revision = _seed_revision_for_domain(domain)

    # Branch: missing entry — c8 §3 says try LLM with empty seed, but main.py
    # currently returns 404 before this is reached. Keep the empty-seed fallback
    # path for safety: if entry is None we still hit the LLM with empty seed.
    if entry is None:
        catalog_baseline: list[dict] = []
        catalog_conditional: list[dict] = []
        seed_questions: list[str] = []
        work_type_label = work_type_id
    else:
        catalog_baseline = entry.get("baseline", []) or []
        catalog_conditional = entry.get("conditional", []) or []
        seed_questions = entry.get("suggested_questions", []) or []
        # Prefer Korean label; fall back to English label or the id.
        work_type_label = (
            entry.get("label_ko") or entry.get("label_en") or work_type_id
        )

    # Conditional seed flattened to LLM-input shape (without source — the LLM
    # will stamp source itself, but we re-validate).
    seed_conditional_for_prompt: list[dict] = []
    for c in catalog_conditional:
        add = c.get("add", {}) or {}
        seed_conditional_for_prompt.append({
            "if": c.get("if", ""),
            "id": add.get("id", ""),
            "content": add.get("content", ""),
            "regulation": add.get("regulation"),
        })

    # If OPENAI_API_KEY is missing, short-circuit straight to fallback so the
    # endpoint stays usable in dev / offline. Don't surface the missing-key
    # 500 from generate_webrtc_key here — recommend-hazards is non-critical.
    if not os.getenv("OPENAI_API_KEY"):
        logger.warning(
            "recommend_hazards: OPENAI_API_KEY not configured — returning static fallback."
        )
        return _fallback_recommend_response(
            catalog_baseline,
            catalog_conditional,
            seed_questions or _build_fallback_seed_questions(catalog_baseline),
            seed_revision,
        )

    try:
        system_prompt = prompt.build_recommend_hazards_prompt(
            domain=domain,
            work_type_label=work_type_label,
            work_type_id=work_type_id,
            language=language,
            context=context,
            seed_baseline=catalog_baseline,
            seed_conditional=seed_conditional_for_prompt,
            seed_suggested_questions=seed_questions,
            # v0.2.4 PR-feedback-2 — Tier-2 augmentation IDs. When non-empty,
            # the prompt builder injects [Augmentation Mode] telling the LLM
            # to keep these items AS-IS and only add/refine.
            prior_baseline_ids=prior_baseline_ids,
            prior_conditional_ids=prior_conditional_ids,
        )
    except Exception as exc:
        logger.warning(f"recommend_hazards: prompt build failed: {exc!r} — fallback.")
        return _fallback_recommend_response(
            catalog_baseline,
            catalog_conditional,
            seed_questions or _build_fallback_seed_questions(catalog_baseline),
            seed_revision,
        )

    user_message = "Generate the JSON now."
    if refresh_seed is not None:
        user_message += " This is a refresh request — vary perspective and emphasis."

    payload = {
        "model": OPENAI_CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": OPENAI_CHAT_TEMPERATURE,
        "max_tokens": OPENAI_CHAT_MAX_TOKENS,
        "response_format": {"type": "json_object"},
    }
    headers = _get_headers()

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                OPENAI_CHAT_COMPLETIONS_URL,
                headers=headers,
                json=payload,
                timeout=OPENAI_CHAT_TIMEOUT,
            )
        if resp.status_code != 200:
            logger.warning(
                f"recommend_hazards: OpenAI returned {resp.status_code}: {resp.text[:300]} — fallback."
            )
            return _fallback_recommend_response(
                catalog_baseline,
                catalog_conditional,
                seed_questions or _build_fallback_seed_questions(catalog_baseline),
                seed_revision,
            )
        body = resp.json()
        content = (
            body.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            or ""
        )
        parsed = json.loads(content)
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError) as exc:
        logger.warning(f"recommend_hazards: LLM call/parse failed: {exc!r} — fallback.")
        return _fallback_recommend_response(
            catalog_baseline,
            catalog_conditional,
            seed_questions or _build_fallback_seed_questions(catalog_baseline),
            seed_revision,
        )

    # ── Schema validation + seed.id preservation guard ──────────────────
    if not isinstance(parsed, dict):
        logger.warning("recommend_hazards: LLM response not a dict — fallback.")
        return _fallback_recommend_response(
            catalog_baseline,
            catalog_conditional,
            seed_questions or _build_fallback_seed_questions(catalog_baseline),
            seed_revision,
        )

    out_baseline_raw = parsed.get("baseline")
    out_conditional_raw = parsed.get("conditional")
    out_questions_raw = parsed.get("suggested_questions")
    out_incidents_raw = parsed.get("incident_cases")
    # PR F: optional new arrays (scenarios / mitigations / ppe). Missing or
    # malformed => empty list. Non-fatal — never bail to fallback for these.
    out_scenarios_raw = parsed.get("scenarios")
    out_mitigations_raw = parsed.get("mitigations")
    out_ppe_raw = parsed.get("ppe")

    if not isinstance(out_baseline_raw, list):
        logger.warning("recommend_hazards: baseline missing/invalid — fallback.")
        return _fallback_recommend_response(
            catalog_baseline,
            catalog_conditional,
            seed_questions or _build_fallback_seed_questions(catalog_baseline),
            seed_revision,
        )

    # PR F: scenarios / mitigations / ppe arrays. Each item: {id, content, source}.
    # Drop malformed entries silently rather than failing the whole response —
    # the frontend prefill effect simply skips empty arrays.
    # NOTE: This helper is defined here (above the baseline loop) instead of below
    # so it can also be invoked per-baseline-item for Phase 2.x PR-1.
    def _normalize_simple_items(raw: object, default_source: str) -> list[dict]:
        out: list[dict] = []
        if not isinstance(raw, list):
            return out
        for item in raw:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, str) or not content.strip():
                continue
            entry: dict = {
                "id": str(item.get("id") or "").strip()
                or f"{default_source.upper()}-{len(out) + 1}",
                "content": content.strip(),
                "source": item.get("source") if item.get("source") in ("catalog", "llm") else "llm",
            }
            out.append(entry)
        return out

    # Stamp source: ids that exist in the catalog seed are 'catalog'; others 'llm'.
    # Phase 2.x PR-1: ALSO validate per-item scenarios/mitigations/ppe inside
    # each baseline item. Missing/malformed => empty array (silent). Catalog
    # seed items inherit per-item arrays from the on-disk catalog when the LLM
    # drops them — see seed merge below.
    seed_ids = {b.get("id") for b in catalog_baseline if b.get("id")}
    seed_by_id = {b.get("id"): b for b in catalog_baseline if b.get("id")}
    out_baseline: list[dict] = []
    seen_ids: set = set()
    for item in out_baseline_raw:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        bid = item["id"]
        seen_ids.add(bid)
        labeled = {k: v for k, v in item.items()}
        labeled["source"] = "catalog" if bid in seed_ids else "llm"
        # Phase 2.x PR-1: per-item scenarios / mitigations / ppe.
        per_scen = _normalize_simple_items(
            item.get("scenarios"), f"{bid}-sc"
        )
        per_mit = _normalize_simple_items(
            item.get("mitigations"), f"{bid}-mit"
        )
        per_ppe = _normalize_simple_items(item.get("ppe"), f"{bid}-ppe")
        # Catalog seed fallback: if the LLM dropped per-item arrays for a
        # catalog-baseline id, splice from the on-disk catalog seed (PR-1 §F).
        if bid in seed_by_id:
            seed_item = seed_by_id[bid]
            if not per_scen:
                per_scen = _normalize_simple_items(
                    seed_item.get("scenarios"), f"{bid}-sc"
                )
                # Stamp catalog source explicitly for seed-supplied items.
                for s in per_scen:
                    s["source"] = "catalog"
            if not per_mit:
                per_mit = _normalize_simple_items(
                    seed_item.get("mitigations"), f"{bid}-mit"
                )
                for s in per_mit:
                    s["source"] = "catalog"
            if not per_ppe:
                per_ppe = _normalize_simple_items(
                    seed_item.get("ppe"), f"{bid}-ppe"
                )
                for s in per_ppe:
                    s["source"] = "catalog"
        labeled["scenarios"] = per_scen
        labeled["mitigations"] = per_mit
        labeled["ppe"] = per_ppe
        out_baseline.append(labeled)

    # Re-add any seed.baseline ids the LLM dropped (preserve guarantee).
    missing_seed_ids = seed_ids - seen_ids
    if missing_seed_ids:
        logger.warning(
            f"recommend_hazards: LLM dropped seed baseline ids {missing_seed_ids} — re-adding from catalog."
        )
        for sid in missing_seed_ids:
            seed_item = seed_by_id.get(sid)
            if not seed_item:
                continue
            recovered = {k: v for k, v in seed_item.items()}
            recovered["source"] = "catalog"
            # Splice per-item arrays from the catalog seed (may be empty if
            # the catalog file does not yet carry per-item data).
            seed_scen = _normalize_simple_items(
                seed_item.get("scenarios"), f"{sid}-sc"
            )
            for s in seed_scen:
                s["source"] = "catalog"
            seed_mit = _normalize_simple_items(
                seed_item.get("mitigations"), f"{sid}-mit"
            )
            for s in seed_mit:
                s["source"] = "catalog"
            seed_ppe = _normalize_simple_items(
                seed_item.get("ppe"), f"{sid}-ppe"
            )
            for s in seed_ppe:
                s["source"] = "catalog"
            recovered["scenarios"] = seed_scen
            recovered["mitigations"] = seed_mit
            recovered["ppe"] = seed_ppe
            out_baseline.append(recovered)

    # Conditional: same labeling pass.
    seed_cond_ids = {
        c.get("add", {}).get("id") for c in catalog_conditional if c.get("add")
    }
    out_conditional: list[dict] = []
    if isinstance(out_conditional_raw, list):
        for item in out_conditional_raw:
            if not isinstance(item, dict):
                continue
            cid = item.get("id")
            labeled = {k: v for k, v in item.items()}
            labeled["source"] = "catalog" if cid in seed_cond_ids else "llm"
            out_conditional.append(labeled)

    # Questions: must be list[str].
    out_questions: list[str] = []
    if isinstance(out_questions_raw, list):
        for q in out_questions_raw:
            if isinstance(q, str) and q.strip():
                out_questions.append(q.strip())
    if not out_questions:
        out_questions = seed_questions or _build_fallback_seed_questions(catalog_baseline)

    # Incident cases: stamp default source if missing.
    out_incidents: list[dict] = []
    if isinstance(out_incidents_raw, list):
        for item in out_incidents_raw:
            if not isinstance(item, dict) or not item.get("title"):
                continue
            labeled = {k: v for k, v in item.items()}
            labeled.setdefault("source", "llm-placeholder")
            out_incidents.append(labeled)

    # PR F + Phase 2.x PR-1: top-level flat scenarios / mitigations / ppe.
    # The helper `_normalize_simple_items` is defined above (per-baseline loop).
    # Backward compat: aggregate per-item arrays into the flat top-level arrays
    # if the LLM only emitted per-item (or if the LLM emitted both, the per-item
    # union still de-duplicates by id). Older clients read only the flat arrays.
    out_scenarios = _normalize_simple_items(out_scenarios_raw, "sc")
    out_mitigations = _normalize_simple_items(out_mitigations_raw, "mit")
    out_ppe = _normalize_simple_items(out_ppe_raw, "ppe")

    def _merge_dedup_by_id(flat: list[dict], items: list[dict]) -> list[dict]:
        """Merge per-item entries into the flat list, dropping duplicates by id.

        Phase 2.x PR-1 backward-compat: even when the LLM populates per-item
        arrays inside baseline, frontend code that still reads only the flat
        top-level scenarios/mitigations/ppe must still see those items.
        """
        if not items:
            return flat
        seen = {entry.get("id") for entry in flat if entry.get("id")}
        out = list(flat)
        for entry in items:
            eid = entry.get("id")
            if eid and eid in seen:
                continue
            out.append(entry)
            if eid:
                seen.add(eid)
        return out

    for b in out_baseline:
        out_scenarios = _merge_dedup_by_id(out_scenarios, b.get("scenarios") or [])
        out_mitigations = _merge_dedup_by_id(out_mitigations, b.get("mitigations") or [])
        out_ppe = _merge_dedup_by_id(out_ppe, b.get("ppe") or [])

    return {
        "baseline": out_baseline,
        "conditional": out_conditional,
        "suggested_questions": out_questions,
        "incident_cases": out_incidents,
        # PR F:
        "scenarios": out_scenarios,
        "mitigations": out_mitigations,
        "ppe": out_ppe,
        "seed_revision": seed_revision,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# PR C (Phase 2.0 MVP, c5 §6) — analyze_image: GPT-4o vision (chat completions)
# JSON-mode call. Failure => empty hazards fallback (never raise to the caller).
# ---------------------------------------------------------------------------
OPENAI_VISION_TIMEOUT = 20.0
OPENAI_VISION_MAX_TOKENS = 1500
OPENAI_VISION_TEMPERATURE = 0.2
_VISION_HAZARD_CAP = 5
_VISION_RATIONALE_MAX = 200
_VISION_SUMMARY_MAX = 300


def _vision_failure_fallback(language: str) -> dict:
    """Standard empty-hazards fallback. Language-aware summary."""
    msg = {
        "korean": "분석 실패 — 잠시 후 다시 시도하세요.",
        "english": "Analysis failed — please try again shortly.",
        "vietnamese": "Phân tích thất bại — vui lòng thử lại sau.",
        "thai": "การวิเคราะห์ล้มเหลว — โปรดลองอีกครั้งในภายหลัง",
        "indonesian": "Analisis gagal — silakan coba lagi sebentar.",
    }.get(language, "분석 실패 — 잠시 후 다시 시도하세요.")
    return {"summary": msg, "hazards": []}


def _clamp01(n: float) -> float:
    try:
        v = float(n)
    except (TypeError, ValueError):
        return 0.0
    if v != v:  # NaN
        return 0.0
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return v


def _truncate_text(s: str, max_len: int) -> str:
    if not isinstance(s, str):
        return ""
    s = s.strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "…"


def _normalize_vision_response(raw: dict, language: str) -> dict:
    """Validate + clamp the LLM JSON output. Never raise; return empty-hazards
    fallback shape on any structural problem."""
    if not isinstance(raw, dict):
        return _vision_failure_fallback(language)
    summary = _truncate_text(raw.get("summary", ""), _VISION_SUMMARY_MAX)
    if not summary:
        # GPT-4o sometimes omits summary — synthesize a neutral one rather than fail.
        summary = {
            "korean": "사진 분석을 완료했습니다.",
            "english": "Image analysis complete.",
            "vietnamese": "Phân tích hình ảnh hoàn tất.",
            "thai": "การวิเคราะห์ภาพเสร็จสิ้น",
            "indonesian": "Analisis gambar selesai.",
        }.get(language, "사진 분석을 완료했습니다.")
    hazards_raw = raw.get("hazards")
    out_hazards: list[dict] = []
    if isinstance(hazards_raw, list):
        for item in hazards_raw[: _VISION_HAZARD_CAP]:
            if not isinstance(item, dict):
                continue
            hazard_text = item.get("hazard")
            if not isinstance(hazard_text, str) or not hazard_text.strip():
                continue
            entry: dict = {
                "hazard": hazard_text.strip(),
                "confidence": _clamp01(item.get("confidence", 0)),
                "rationale": _truncate_text(item.get("rationale", ""), _VISION_RATIONALE_MAX),
            }
            if isinstance(item.get("domain_tag"), str) and item["domain_tag"].strip():
                entry["domain_tag"] = item["domain_tag"].strip()
            if isinstance(item.get("suggested_mitigation"), str) and item["suggested_mitigation"].strip():
                entry["suggested_mitigation"] = _truncate_text(
                    item["suggested_mitigation"], 120
                )
            bbox_raw = item.get("bbox")
            if isinstance(bbox_raw, list) and len(bbox_raw) == 4:
                try:
                    bbox = [float(v) for v in bbox_raw]
                    if all(b == b for b in bbox):  # not NaN
                        entry["bbox"] = [
                            _clamp01(bbox[0]),
                            _clamp01(bbox[1]),
                            _clamp01(bbox[2]),
                            _clamp01(bbox[3]),
                        ]
                except (TypeError, ValueError):
                    pass
            out_hazards.append(entry)
    citations_raw = raw.get("citations")
    out_citations: list[dict] | None = None
    if isinstance(citations_raw, list):
        out_citations = []
        for c in citations_raw:
            if not isinstance(c, dict):
                continue
            t = c.get("title")
            s = c.get("summary")
            if isinstance(t, str) and isinstance(s, str) and t.strip() and s.strip():
                out_citations.append({"title": t.strip(), "summary": s.strip()})
        if not out_citations:
            out_citations = None
    result: dict = {"summary": summary, "hazards": out_hazards}
    if out_citations:
        result["citations"] = out_citations
    return result


async def analyze_image(
    image_bytes: bytes,
    mime: str,
    domain: str | None,
    language: str,
    context_messages: str | None = None,
    caption: str | None = None,
) -> dict:
    """GPT-4o vision chat completion. JSON mode. Failure => empty hazards fallback.

    Behavior (c5 §6 fallback priority):
      1. base64 inline-encode the image into a data URL.
      2. Build system prompt via prompt.build_vision_analyze_prompt(domain, language).
      3. POST to chat/completions with response_format={'type':'json_object'},
         model=gpt-4o, temperature=0.2, max_tokens=1500, timeout=20s.
      4. Validate + clamp the JSON output (confidence 0..1, hazards <= 5,
         rationale 200ch cap, summary 300ch cap).
      5. On any failure (no API key, httpx error, JSON parse, schema problem),
         log a warning and return _vision_failure_fallback(language).

    Never raises — caller (FastAPI endpoint) returns this dict directly.
    """
    # Defensive: short-circuit when API key is missing so dev / offline runs
    # still get a structured response instead of a 500 from _get_api_key.
    if not os.getenv("OPENAI_API_KEY"):
        logger.warning(
            "analyze_image: OPENAI_API_KEY not configured — returning empty fallback."
        )
        return _vision_failure_fallback(language)

    # Build system prompt.
    try:
        system_prompt = prompt.build_vision_analyze_prompt(domain, language)
    except Exception as exc:
        logger.warning(f"analyze_image: prompt build failed: {exc!r} — fallback.")
        return _vision_failure_fallback(language)

    # Build the data URL.
    try:
        b64 = base64.b64encode(image_bytes).decode("ascii")
    except Exception as exc:
        logger.warning(f"analyze_image: base64 encode failed: {exc!r} — fallback.")
        return _vision_failure_fallback(language)
    data_url = f"data:{mime};base64,{b64}"

    # Parse context_messages (JSON array string) — non-fatal on bad input.
    context_block_text = ""
    if context_messages:
        try:
            arr = json.loads(context_messages)
            if isinstance(arr, list):
                pieces = [str(s) for s in arr if isinstance(s, str) and s.strip()]
                if pieces:
                    # Cap to the last 4 pieces (token-protective).
                    context_block_text = "\n".join(pieces[-4:])
        except (json.JSONDecodeError, ValueError):
            logger.debug("analyze_image: context_messages parse failed; ignoring.")

    # Build the multimodal user message.
    user_text_parts: list[str] = []
    if caption and caption.strip():
        user_text_parts.append(f"Caption: {caption.strip()}")
    if context_block_text:
        user_text_parts.append(f"Recent chat context:\n{context_block_text}")
    if not user_text_parts:
        user_text_parts.append("이 사진에서 안전 위험을 식별하세요.")
    user_text = "\n\n".join(user_text_parts)

    payload = {
        "model": OPENAI_CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": user_text},
                ],
            },
        ],
        "temperature": OPENAI_VISION_TEMPERATURE,
        "max_tokens": OPENAI_VISION_MAX_TOKENS,
        "response_format": {"type": "json_object"},
    }
    headers = _get_headers()

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                OPENAI_CHAT_COMPLETIONS_URL,
                headers=headers,
                json=payload,
                timeout=OPENAI_VISION_TIMEOUT,
            )
        if resp.status_code != 200:
            logger.warning(
                f"analyze_image: OpenAI returned {resp.status_code}: {resp.text[:300]} — fallback."
            )
            return _vision_failure_fallback(language)
        body = resp.json()
        content = (
            body.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            or ""
        )
        parsed = json.loads(content)
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError) as exc:
        logger.warning(f"analyze_image: LLM call/parse failed: {exc!r} — fallback.")
        return _vision_failure_fallback(language)

    return _normalize_vision_response(parsed, language)


async def generate_webrtc_key(
    mode: str = "tbm",
    language: str = "korean",
    domain: str | None = None,
    work_type_id: str | None = None,
    prepared_summary: dict | None = None,
) -> str:
    # Select prompt and tools based on mode, language, domain, work_type_id,
    # and (PR A_v2-4) optional prepared_summary.
    # Backward compat: any None keeps prior behavior. The TypeError fallbacks
    # also cover older prompt.py revisions during partial rollout.
    try:
        instructions = prompt.get_system_prompt(
            mode, language, domain, work_type_id, prepared_summary=prepared_summary
        )
    except TypeError:
        try:
            instructions = prompt.get_system_prompt(mode, language, domain, work_type_id)
        except TypeError:
            try:
                instructions = prompt.get_system_prompt(mode, language, domain)
            except TypeError:
                instructions = prompt.get_system_prompt(mode, language)

    # v0.2.0 — Append per-domain glossary snippet to boost STT term recognition.
    # c7 #7: pass language so dynamic cap prefers session-language terms.
    glossary_snippet = _build_glossary_snippet(domain, language)
    if glossary_snippet:
        instructions = instructions + "\n\n" + glossary_snippet

    # PR A — c7 #1: append baseline checklist block when work_type_id is set
    # (TBM mode only; EHS mode has no checklist tool).
    if mode == "tbm" and work_type_id:
        baseline_block = _build_baseline_checklist(domain, work_type_id)
        if baseline_block:
            instructions = instructions + "\n\n" + baseline_block

    # v0.2.0 — Domain STT preset (noise reduction + VAD threshold).
    stt_preset = DOMAIN_STT_PRESET.get(domain, DOMAIN_STT_PRESET[None])

    # PR G — Whisper-side language hint + domain term prompt for STT.
    # Both fields prevent the felix-observed mishears (English mis-detection on
    # short Korean utterances; '쥐어차'/'입이' for '지게차'/'길이가').
    transcription_lang_code = LANG_TO_CODE.get(language, "ko")
    transcription_prompt = _build_transcription_prompt(domain, language)

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
                "language": transcription_lang_code,
                **({"prompt": transcription_prompt} if transcription_prompt else {}),
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


# ---------------------------------------------------------------------------
# Phase chat-PR1 — text-only fallback chat transport.
#
# chat_completion is an async generator that yields {"event", "data"} dicts.
# The HTTP handler in main.py serializes them as SSE blocks. We do not yield
# raw SSE strings here so this function stays unit-testable from pytest
# without an HTTP layer.
#
# Single-responsibility split (mobile-app-engineer decision per chat_mode_plan §1.6):
#   - main.py validates request shape, normalizes mode/language/domain.
#   - llm.chat_completion owns: system-prompt build, sliding window,
#     OpenAI call, SSE chunk parse, error mapping.
#   - prompt.get_system_prompt is called with transport="chat" so prompt.py
#     can suppress voice/cue language. If the running prompt.py is older
#     (no transport kwarg yet — race with llm-specialist PR-1), we fall back
#     to the legacy signature so import never fails. The behavior gap (voice
#     wording in chat output) is acceptable until both PRs land together.
# ---------------------------------------------------------------------------
_CHAT_SLIDING_WINDOW_MESSAGES = 60   # 30 turns × (user + assistant)
_CHAT_MAX_OUTPUT_TOKENS = 1200       # chat answers should stay short (cf. recommend = 4000)


def _build_chat_system_prompt(
    *,
    mode: str,
    language: str,
    domain: Optional[str],
    work_type_id: Optional[str],
    prepared_summary: Optional[dict],
) -> str:
    """Build the chat-mode system prompt with graceful fallback.

    During the rollout window where llm-specialist's prompt.py changes have
    not yet landed, the `transport` kwarg may be unrecognized. The TypeError
    fallback chain mirrors generate_webrtc_key's pattern (see L1107-1118).
    """
    try:
        return prompt.get_system_prompt(
            mode,
            language,
            domain,
            work_type_id,
            prepared_summary=prepared_summary,
            transport="chat",
        )
    except TypeError:
        # Legacy prompt.py without transport kwarg — fall back to voice prompt.
        # llm-specialist's PR-1 lands the transport kwarg + chat branch; until
        # then we still serve a usable (but voice-toned) system prompt.
        try:
            return prompt.get_system_prompt(
                mode, language, domain, work_type_id, prepared_summary=prepared_summary
            )
        except TypeError:
            try:
                return prompt.get_system_prompt(mode, language, domain, work_type_id)
            except TypeError:
                try:
                    return prompt.get_system_prompt(mode, language, domain)
                except TypeError:
                    return prompt.get_system_prompt(mode, language)


async def chat_completion(
    *,
    mode: str,
    language: str,
    domain: str | None,
    work_type_id: str | None,
    prepared_summary: dict | None,
    messages: list[dict],
    model: str | None = None,
) -> AsyncIterator[dict]:
    """Stream a chat completion as {event, data} tuples.

    Args:
        mode: "tbm" | "ehs" (already validated upstream).
        language: 5-language enum string (already normalized upstream).
        domain: SessionDomain | None (already normalized upstream).
        work_type_id: optional catalog id.
        prepared_summary: optional prepare-stage payload (TBM only).
        messages: list of {"role": "user"|"assistant", "content": str}.
                  Server applies sliding window (most recent 60 messages).
        model: override; default = OPENAI_CHAT_MINI_MODEL.

    Yields:
        {"event": "delta", "data": {"text": "..."}}     — token chunks
        {"event": "done",  "data": {"finish_reason": "stop"}}
        {"event": "error", "data": {"code": "...", "message": "..."}}

    Error codes:
        - openai_timeout      — httpx Timeout / asyncio.TimeoutError
        - openai_auth         — 401 / 403 (key missing or invalid)
        - openai_rate_limit   — 429
        - openai_unavailable  — 5xx
        - internal            — anything else
    """
    chosen_model = model or OPENAI_CHAT_MINI_MODEL

    # ── system prompt ──────────────────────────────────────────────────
    try:
        system_text = _build_chat_system_prompt(
            mode=mode,
            language=language,
            domain=domain,
            work_type_id=work_type_id,
            prepared_summary=prepared_summary,
        )
    except Exception as exc:
        logger.exception(f"chat_completion: prompt build failed: {exc!r}")
        yield {
            "event": "error",
            "data": {"code": "internal", "message": "내부 오류가 발생했습니다."},
        }
        return

    # ── sliding window (server-side; cf. chat_mode_prompt_adaptation.md §D) ──
    if len(messages) > _CHAT_SLIDING_WINDOW_MESSAGES:
        windowed = messages[-_CHAT_SLIDING_WINDOW_MESSAGES:]
    else:
        windowed = list(messages)

    payload_messages = [{"role": "system", "content": system_text}, *windowed]

    body = {
        "model": chosen_model,
        "messages": payload_messages,
        "temperature": OPENAI_CHAT_TEMPERATURE,
        "max_tokens": _CHAT_MAX_OUTPUT_TOKENS,
        "stream": True,
    }

    # ── OpenAI key (lazy — yield error event instead of HTTPException) ──
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("chat_completion: OPENAI_API_KEY not configured.")
        yield {
            "event": "error",
            "data": {
                "code": "openai_auth",
                "message": "OpenAI API 키가 설정되지 않았습니다.",
            },
        }
        return

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # ── streaming POST ─────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=OPENAI_CHAT_TIMEOUT) as client:
            async with client.stream(
                "POST",
                OPENAI_CHAT_COMPLETIONS_URL,
                headers=headers,
                json=body,
            ) as resp:
                if resp.status_code != 200:
                    # Drain body for logging/debug, then map status → code.
                    try:
                        err_text = (await resp.aread()).decode("utf-8", errors="replace")
                    except Exception:
                        err_text = ""
                    logger.error(
                        f"chat_completion: OpenAI {resp.status_code} — {err_text[:500]}"
                    )
                    if resp.status_code in (401, 403):
                        code = "openai_auth"
                        msg = "OpenAI 인증에 실패했습니다."
                    elif resp.status_code == 429:
                        code = "openai_rate_limit"
                        msg = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
                    elif 500 <= resp.status_code < 600:
                        code = "openai_unavailable"
                        msg = "잠시 후 다시 시도해주세요."
                    else:
                        code = "internal"
                        msg = "내부 오류가 발생했습니다."
                    yield {"event": "error", "data": {"code": code, "message": msg}}
                    return

                # SSE parse — OpenAI emits one `data: <json>\n\n` per chunk,
                # ending with `data: [DONE]\n\n`.
                async for raw_line in resp.aiter_lines():
                    if not raw_line:
                        continue
                    line = raw_line.strip()
                    if not line.startswith("data:"):
                        continue
                    payload_str = line[len("data:"):].strip()
                    if payload_str == "[DONE]":
                        yield {
                            "event": "done",
                            "data": {"finish_reason": "stop"},
                        }
                        return
                    try:
                        chunk = json.loads(payload_str)
                    except json.JSONDecodeError:
                        # Skip malformed chunk — usually a keepalive comment.
                        logger.debug(
                            f"chat_completion: skip non-JSON chunk: {payload_str[:120]!r}"
                        )
                        continue
                    try:
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        delta = choices[0].get("delta") or {}
                        text = delta.get("content")
                        finish_reason = choices[0].get("finish_reason")
                    except (AttributeError, IndexError, TypeError):
                        continue
                    if text:
                        yield {"event": "delta", "data": {"text": text}}
                    if finish_reason and finish_reason != "stop":
                        # length / content_filter — surface as done with reason.
                        yield {
                            "event": "done",
                            "data": {"finish_reason": finish_reason},
                        }
                        return
                # Stream ended without [DONE] marker — emit synthetic done.
                yield {"event": "done", "data": {"finish_reason": "stop"}}
                return
    except (httpx.TimeoutException, asyncio.TimeoutError):
        logger.warning("chat_completion: OpenAI timeout.")
        yield {
            "event": "error",
            "data": {
                "code": "openai_timeout",
                "message": "잠시 후 다시 시도해주세요.",
            },
        }
        return
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code if exc.response is not None else 0
        logger.error(f"chat_completion: HTTPStatusError {status}: {exc!r}")
        if status in (401, 403):
            code = "openai_auth"
            msg = "OpenAI 인증에 실패했습니다."
        elif status == 429:
            code = "openai_rate_limit"
            msg = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
        elif 500 <= status < 600:
            code = "openai_unavailable"
            msg = "잠시 후 다시 시도해주세요."
        else:
            code = "internal"
            msg = "내부 오류가 발생했습니다."
        yield {"event": "error", "data": {"code": code, "message": msg}}
        return
    except httpx.HTTPError as exc:
        logger.error(f"chat_completion: httpx error: {exc!r}")
        yield {
            "event": "error",
            "data": {
                "code": "openai_unavailable",
                "message": "잠시 후 다시 시도해주세요.",
            },
        }
        return
    except Exception as exc:
        logger.exception(f"chat_completion: unexpected error: {exc!r}")
        yield {
            "event": "error",
            "data": {"code": "internal", "message": "내부 오류가 발생했습니다."},
        }
        return


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