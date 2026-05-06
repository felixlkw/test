// visionAnalyze — PR C (Phase 2.0 MVP, c5 §5).
//
// `/api/vision-analyze` multipart POST + 응답 파싱.
// 백엔드(llm.analyze_image)는 GPT-4o vision JSON 모드 호출, 실패 시 빈
// hazards 폴백 — 본 클라이언트는 polling 없이 단발성으로 await.
//
// 정책 (c5 §5.1):
//   - 단일 이미지(이미 imageProcessing.resizeImage로 ~300KB 이하로 줄여서 호출).
//   - timeout 25s — 백엔드 OPENAI_CHAT_TIMEOUT 15s + 네트워크 마진 10s.
//   - 5 MB 클라이언트 측 가드 — 백엔드도 동일 검증.
//   - context_messages는 직전 N개 user/assistant 메시지 텍스트(JSON 직렬화).
//
// 신규 라이브러리 0건 (FormData + fetch).

import type { SessionDomain, SessionLanguage } from "./sessionModel";

export interface VisionHazard {
  hazard: string;
  domain_tag?: string;
  /** 0..1. PR C 자동 보강 임계 = 0.7. */
  confidence: number;
  /** [x, y, w, h] normalized 0..1. */
  bbox?: [number, number, number, number];
  rationale: string;
  suggested_mitigation?: string;
}

export interface HazardDetectionResponse {
  /** 짧은 한 줄 요약 — "위험 N건 감지" / "특이 위험 미식별". */
  summary: string;
  hazards: VisionHazard[];
  /** 옵션. Phase 2에서 도메인 카탈로그 인용 노출용. PR C는 미사용. */
  citations?: { title: string; summary: string }[];
}

const VISION_ANALYZE_URL = "/api/vision-analyze";
const VISION_TIMEOUT_MS = 25_000;
/** 5 MB — c5 §9.3. 백엔드도 같은 한도. */
const MAX_BYTES = 5 * 1024 * 1024;

export interface AnalyzeImageOptions {
  blob: Blob;
  domain?: SessionDomain;
  language: SessionLanguage;
  /** 직전 user/assistant 텍스트 메시지 (최대 4건 권장 — 토큰 절감). */
  contextMessages?: string[];
  /** 사용자 캡션 (옵션). */
  caption?: string;
}

export class VisionAnalyzeError extends Error {
  constructor(
    message: string,
    public readonly cause?: "size" | "mime" | "timeout" | "network" | "server",
  ) {
    super(message);
    this.name = "VisionAnalyzeError";
  }
}

export async function analyzeImage(
  opts: AnalyzeImageOptions,
): Promise<HazardDetectionResponse> {
  const { blob, domain, language, contextMessages, caption } = opts;

  // ── 클라이언트 측 가드(백엔드도 동일 검증) ────────────────
  if (!blob.type.startsWith("image/")) {
    throw new VisionAnalyzeError(
      `지원하지 않는 이미지 형식입니다: ${blob.type}`,
      "mime",
    );
  }
  if (blob.size > MAX_BYTES) {
    throw new VisionAnalyzeError(
      `이미지가 너무 큽니다 (${(blob.size / 1024 / 1024).toFixed(1)} MB > 5 MB).`,
      "size",
    );
  }

  // ── multipart payload 구성 ────────────────────────────────
  const form = new FormData();
  // backend는 image/jpeg/png/webp만 허용 — 파일명만 합리적으로 부여.
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  form.append("image", blob, `capture.${ext}`);
  // backend는 SessionDomain 그대로 받아 catalog/prompt 분기. None 폴백 안전.
  if (domain) form.append("domain", domain);
  form.append("language", language);
  if (contextMessages && contextMessages.length > 0) {
    form.append("context_messages", JSON.stringify(contextMessages));
  }
  if (caption && caption.trim().length > 0) {
    form.append("caption", caption.trim());
  }

  // ── timeout이 있는 fetch ──────────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const res = await fetch(VISION_ANALYZE_URL, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { detail?: string };
        detail = j?.detail ?? "";
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new VisionAnalyzeError(
        `분석 요청 실패 (${res.status}): ${detail || "unknown"}`,
        "server",
      );
    }

    const json = (await res.json()) as Partial<HazardDetectionResponse>;
    return normalizeResponse(json);
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof VisionAnalyzeError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new VisionAnalyzeError(
        "분석 요청 시간이 초과되었습니다. 네트워크 상태를 확인해주세요.",
        "timeout",
      );
    }
    throw new VisionAnalyzeError(
      `분석 요청 중 오류: ${(err as Error).message ?? "unknown"}`,
      "network",
    );
  }
}

/** 백엔드 응답 정상화 — confidence 0..1 clamp + 누락 필드 보정. */
function normalizeResponse(
  raw: Partial<HazardDetectionResponse>,
): HazardDetectionResponse {
  const summary =
    typeof raw.summary === "string" && raw.summary.trim().length > 0
      ? raw.summary.trim()
      : "분석을 완료했습니다.";
  const hazardsRaw = Array.isArray(raw.hazards) ? raw.hazards : [];
  const hazards: VisionHazard[] = hazardsRaw
    .filter((h): h is VisionHazard => !!h && typeof h.hazard === "string")
    .map((h) => ({
      hazard: h.hazard,
      domain_tag: typeof h.domain_tag === "string" ? h.domain_tag : undefined,
      confidence: clamp01(typeof h.confidence === "number" ? h.confidence : 0),
      bbox: validBbox(h.bbox),
      rationale:
        typeof h.rationale === "string" ? h.rationale : "(rationale 미제공)",
      suggested_mitigation:
        typeof h.suggested_mitigation === "string"
          ? h.suggested_mitigation
          : undefined,
    }));
  const citations = Array.isArray(raw.citations)
    ? raw.citations
        .filter(
          (c): c is { title: string; summary: string } =>
            !!c && typeof c.title === "string" && typeof c.summary === "string",
        )
        .map((c) => ({ title: c.title, summary: c.summary }))
    : undefined;
  return { summary, hazards, citations };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function validBbox(
  raw: unknown,
): [number, number, number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const nums = raw.map((v) => (typeof v === "number" ? v : Number.NaN));
  if (nums.some((v) => Number.isNaN(v))) return undefined;
  return [
    clamp01(nums[0]),
    clamp01(nums[1]),
    clamp01(nums[2]),
    clamp01(nums[3]),
  ];
}
