// pdfGenerate — PR D (Phase 2.0 MVP, c6 §3.IX, felix 결정 5=A 클라이언트).
//
// pdf-lib만 사용 — 백엔드 호출 0(오프라인 가능, 반도체 영업비밀 보호).
// 한글 폰트는 정적 자산 `/fonts/NotoSansKR-VariableFont_wght.ttf` (~150 KB)에서
// fetch 시도. 실패 시 시스템 기본 폰트(StandardFonts.Helvetica)로 fallback —
// 한글이 깨질 수 있으나 영문/숫자/구조는 보존(felix dev 안내).
//
// 페이지 구성:
//   1. 표지 — SafeMate 헤더 라인(orange) + 작업명·도메인·날짜 + 세션 ID.
//   2. 사전 정보 — work_summary / changes / prior_info.
//   3. 체크리스트 — checklist_items의 completed 항목.
//   4. 8필드 구조화 — work_summary / changes_today / hazards / scenarios /
//      mitigations / ppe / special_notes.
//   5. 참석자 + 서명 그리드 — 이름 / 역할 / 서명 PNG thumbnail.
//   6. 인용 출처 — citations[].title + url.
//
// 폰트 fallback 처리:
//   - 한글 폰트 fetch 실패 시 latinFont으로 그리되, 한글 영역은 `?` 또는 ascii
//     fallback로 깨지지 않게 처리. dev 환경에선 이 fallback이 가시화됨.

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type {
  Session,
  Attendee,
  LeaderAttestation,
  PreparedBaselineItem,
  StructuredChecklist,
} from "./sessionModel";
import type { ChecklistItem } from "./checklist";

// PwC 토큰 (tailwind.config.js 1:1 매핑).
const PWC_ORANGE = rgb(0xe0 / 255, 0x30 / 255, 0x1e / 255);
const PWC_INK = rgb(0x1e / 255, 0x1e / 255, 0x1e / 255);
const PWC_INK_SOFT = rgb(0x55 / 255, 0x55 / 255, 0x55 / 255);
const PWC_INK_MUTE = rgb(0x8a / 255, 0x8a / 255, 0x8a / 255);
const PWC_BORDER = rgb(0xe5 / 255, 0xe0 / 255, 0xdc / 255);

// A4 (pt) — 595 × 842.
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 48;
const MARGIN_Y = 56;

// 한글 폰트 정적 자산 경로. static(non-variable) TTF 사용 — pdf-lib + fontkit가
// Variable Font의 axis 인스턴스화를 완전 지원하지 않아 일부 글리프 누락 발생
// (2026-05-06 수정). 정적 Regular는 표준 TrueType이라 subset 임베드 정상.
// 6.18 MB 1회 fetch → 브라우저 캐시. PDF 결과물에는 사용 글리프만 임베드되어
// 실제 PDF 사이즈는 ~수십~수백 KB.
// 미존재 시 fetch 실패 → Helvetica fallback (한글은 ascii 치환).
const KO_FONT_URL = "/fonts/static/NotoSansKR-Regular.ttf";

const DOMAIN_LABEL_KO_LOCAL: Record<string, string> = {
  manufacturing: "제조",
  construction: "건설",
  heavy_industry: "중공업",
  semiconductor: "반도체",
};

interface FontPair {
  /** 한글/한자/유니코드 — 가능하면 NotoSansKR, 실패 시 latin과 동일. */
  uni: PDFFont;
  /** 헬베티카 fallback (영문/숫자/기호). */
  latin: PDFFont;
  /** 한글 폰트 로드 성공 여부. UI에 안내. */
  hasKorean: boolean;
}

/** TTF/OTF 매직 바이트 검사. SPA fallback이 index.html을 폰트 자리에 돌려주는
 *  케이스를 즉시 감지(html은 `<!`로 시작 → magic mismatch). */
function looksLikeFont(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // TrueType: 0x00010000 / 'true' / 'typ1'
  // OpenType: 'OTTO' / TrueType collection: 'ttcf'
  const m =
    (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  return (
    m === 0x00010000 ||
    m === 0x74727565 || // 'true'
    m === 0x74797031 || // 'typ1'
    m === 0x4f54544f || // 'OTTO'
    m === 0x74746366 // 'ttcf'
  );
}

async function loadFonts(doc: PDFDocument): Promise<FontPair> {
  // fontkit 등록 — 커스텀 TTF 임베드 필수.
  // pdf-lib 단독으로는 StandardFonts(Helvetica 등)만 임베드 가능하므로
  // 한글 폰트 시도 전 1회 등록.
  doc.registerFontkit(fontkit);

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  let uni = helv;
  let hasKorean = false;

  // 2026-05-07 felix HITL — 한글 ??? 모두 출력 회귀 발생.
  // 원인 후보:
  //   (A) fetch가 SPA fallback으로 index.html을 받음 → embedFont가 throw OR magic 불일치
  //   (B) embedFont(6.18MB, {subset:false})가 브라우저 컨텍스트에서 throw (Node는 통과)
  //   (C) 네트워크/MIME 이슈로 arrayBuffer가 빈 또는 손상된 데이터
  // 해결: 다단 fallback + 진단 로그.
  //   1. fetch + content 검증(매직 바이트 + 크기 sanity).
  //   2. embedFont(bytes, {subset: false}) 시도 — 글리프 손상 0(2026-05-06 fix).
  //   3. 실패 시 embedFont(bytes, {subset: true}) — 일부 글리프 손상 가능하나 모두 ???보다 양호.
  //   4. 두 시도 모두 실패 시 Helvetica + ASCII sanitize.
  // 모든 단계에서 console.error/warn로 어디서 끊겼는지 명확히 노출 → DevTools에서 즉시 진단.
  try {
    const t0 = performance.now();
    const res = await fetch(KO_FONT_URL);
    if (!res.ok) {
      console.error(
        `[pdfGenerate] Korean font fetch returned ${res.status} ${res.statusText} for ${KO_FONT_URL} — falling back to Helvetica.`,
      );
      return { uni, latin: helv, hasKorean: false };
    }
    const ct = res.headers.get("content-type") || "(none)";
    const cl = res.headers.get("content-length") || "(none)";
    const bytes = new Uint8Array(await res.arrayBuffer());
    console.log(
      `[pdfGenerate] Korean font fetched: ${bytes.length.toLocaleString()} bytes (content-type: ${ct}, content-length: ${cl}) in ${(performance.now() - t0).toFixed(0)}ms`,
    );
    if (!looksLikeFont(bytes)) {
      console.error(
        `[pdfGenerate] Fetched bytes are NOT a valid TTF/OTF (magic mismatch). Likely SPA fallback returned index.html. First 16 bytes: ${Array.from(
          bytes.slice(0, 16),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")} — falling back to Helvetica.`,
      );
      return { uni, latin: helv, hasKorean: false };
    }

    // 1차 시도 — subset: false (글리프 손상 0).
    try {
      const tEmbed = performance.now();
      uni = await doc.embedFont(bytes, { subset: false });
      hasKorean = true;
      console.log(
        `[pdfGenerate] Korean font embedded (subset: false) in ${(performance.now() - tEmbed).toFixed(0)}ms`,
      );
      return { uni, latin: helv, hasKorean };
    } catch (e1) {
      console.warn(
        "[pdfGenerate] embedFont(subset:false) failed — retrying with subset:true:",
        e1,
      );
    }

    // 2차 시도 — subset: true (일부 글리프 손상 가능, 그래도 모두 ???보다 양호).
    try {
      const tEmbed = performance.now();
      uni = await doc.embedFont(bytes, { subset: true });
      hasKorean = true;
      console.warn(
        `[pdfGenerate] Korean font embedded (subset: true, partial-glyph risk) in ${(performance.now() - tEmbed).toFixed(0)}ms`,
      );
      return { uni, latin: helv, hasKorean };
    } catch (e2) {
      console.error(
        "[pdfGenerate] embedFont(subset:true) also failed — falling back to Helvetica + ASCII sanitize:",
        e2,
      );
    }
  } catch (err) {
    console.error(
      "[pdfGenerate] Korean font load failed (fetch / arrayBuffer):",
      err,
    );
  }
  return { uni, latin: helv, hasKorean };
}

interface DrawCursor {
  page: PDFPage;
  y: number;
}

/** 페이지에 텍스트를 그리되, y가 하단 여백을 넘으면 새 페이지로 전환.
 *  반환된 cursor는 다음 줄 y 위치. */
function drawText(
  doc: PDFDocument,
  cursor: DrawCursor,
  text: string,
  opts: {
    font: PDFFont;
    size?: number;
    color?: ReturnType<typeof rgb>;
    indent?: number;
    /** sanitize: pdf-lib는 latin 외 codepoints에 throw. uni 폰트가 있으면 그대로,
     *  없으면 latin 외 글자를 '?'로 치환. */
    sanitizeForLatin?: boolean;
  },
): DrawCursor {
  const size = opts.size ?? 11;
  const color = opts.color ?? PWC_INK;
  const indent = opts.indent ?? 0;
  let safe = text;
  if (opts.sanitizeForLatin) {
    safe = sanitizeAscii(text);
  }
  // 줄바꿈 처리 — 매우 간단(\n 분리 + 페이지 넘김).
  const lines = safe.split(/\r?\n/);
  let { page, y } = cursor;
  for (const ln of lines) {
    if (y < MARGIN_Y) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_Y;
    }
    try {
      page.drawText(ln, {
        x: MARGIN_X + indent,
        y,
        size,
        color,
        font: opts.font,
      });
    } catch (err) {
      // 폰트가 codepoint 미지원 시 latin sanitize fallback.
      const fallback = sanitizeAscii(ln);
      try {
        page.drawText(fallback, {
          x: MARGIN_X + indent,
          y,
          size,
          color,
          font: opts.font,
        });
      } catch {
        // 그래도 실패하면 무시(레이아웃 보존).
        console.warn("[pdfGenerate] drawText failed:", err);
      }
    }
    y -= size + 4;
  }
  return { page, y };
}

/** non-ASCII codepoints를 '?'로 치환. 폰트 미지원 시 fallback. */
function sanitizeAscii(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code < 0x7f) {
      out += ch;
    } else if (ch === "\n" || ch === "\t") {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

function drawDivider(page: PDFPage, y: number, color = PWC_ORANGE): void {
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_W - MARGIN_X, y },
    thickness: 1,
    color,
  });
}

function drawSectionHeader(
  doc: PDFDocument,
  cursor: DrawCursor,
  title: string,
  fonts: FontPair,
): DrawCursor {
  let { page, y } = cursor;
  if (y < MARGIN_Y + 40) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_Y;
  }
  y -= 8;
  const textCursor = drawText(
    doc,
    { page, y },
    title,
    { font: fonts.hasKorean ? fonts.uni : fonts.latin, size: 14, color: PWC_ORANGE, sanitizeForLatin: !fonts.hasKorean },
  );
  drawDivider(textCursor.page, textCursor.y - 2, PWC_ORANGE);
  return { page: textCursor.page, y: textCursor.y - 10 };
}

function drawBullets(
  doc: PDFDocument,
  cursor: DrawCursor,
  items: string[],
  fonts: FontPair,
): DrawCursor {
  let c = cursor;
  for (const item of items) {
    c = drawText(doc, c, `- ${item}`, {
      font: fonts.hasKorean ? fonts.uni : fonts.latin,
      size: 11,
      color: PWC_INK,
      indent: 6,
      sanitizeForLatin: !fonts.hasKorean,
    });
  }
  return c;
}

function drawKv(
  doc: PDFDocument,
  cursor: DrawCursor,
  label: string,
  value: string,
  fonts: FontPair,
): DrawCursor {
  let c = drawText(doc, cursor, label, {
    font: fonts.hasKorean ? fonts.uni : fonts.latin,
    size: 10,
    color: PWC_INK_MUTE,
    sanitizeForLatin: !fonts.hasKorean,
  });
  c = drawText(doc, c, value || "—", {
    font: fonts.hasKorean ? fonts.uni : fonts.latin,
    size: 12,
    color: PWC_INK,
    indent: 6,
    sanitizeForLatin: !fonts.hasKorean,
  });
  c.y -= 4;
  return c;
}

/** PNG data URL → Uint8Array decode. */
function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  try {
    const idx = dataUrl.indexOf(",");
    if (idx < 0) return null;
    const b64 = dataUrl.slice(idx + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function drawAttendeeRow(
  doc: PDFDocument,
  cursor: DrawCursor,
  attendee: Attendee,
  fonts: FontPair,
): Promise<DrawCursor> {
  let { page, y } = cursor;
  // 한 행 높이 ~50pt — 페이지 넘김 가드.
  if (y < MARGIN_Y + 60) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN_Y;
  }
  const font = fonts.hasKorean ? fonts.uni : fonts.latin;
  const sanitize = !fonts.hasKorean;
  // 이름 + 역할
  const name = attendee.name || "(이름 미입력)";
  const role = attendee.role ? ` · ${attendee.role}` : "";
  const headerLine = `${name}${role}`;
  let c = drawText(doc, { page, y }, headerLine, {
    font,
    size: 12,
    color: PWC_INK,
    sanitizeForLatin: sanitize,
  });
  // 서명 상태
  const status = attendee.signed
    ? attendee.signature_data_url
      ? "서명 완료 (캔버스)"
      : "본인 동의 확인"
    : "미서명";
  c = drawText(doc, c, status, {
    font,
    size: 9,
    color: attendee.signed ? PWC_ORANGE : PWC_INK_MUTE,
    indent: 4,
    sanitizeForLatin: sanitize,
  });
  // 서명 thumbnail (PNG)
  if (attendee.signature_data_url) {
    const bytes = dataUrlToBytes(attendee.signature_data_url);
    if (bytes) {
      try {
        const img = await doc.embedPng(bytes);
        const thumbW = 96;
        const ratio = img.height / img.width;
        const thumbH = Math.min(48, thumbW * ratio);
        c.page.drawImage(img, {
          x: PAGE_W - MARGIN_X - thumbW,
          y: c.y - thumbH + 14,
          width: thumbW,
          height: thumbH,
        });
      } catch (err) {
        console.warn("[pdfGenerate] embedPng failed:", err);
      }
    }
  }
  // 행 사이 공백 + 가는 구분선
  c.y -= 6;
  c.page.drawLine({
    start: { x: MARGIN_X, y: c.y },
    end: { x: PAGE_W - MARGIN_X, y: c.y },
    thickness: 0.4,
    color: PWC_BORDER,
  });
  c.y -= 6;
  return c;
}

/** 메인 export — 세션 + 참석자 → PDF Blob. */
export async function generateSessionPdf(
  session: Session,
  attendees: Attendee[],
): Promise<Blob> {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const sanitize = !fonts.hasKorean;
  const font = fonts.hasKorean ? fonts.uni : fonts.latin;

  // ── Page 1: 표지 ───────────────────────────────────────────
  const page = doc.addPage([PAGE_W, PAGE_H]);
  // SafeMate 오렌지 라인
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 8,
    width: PAGE_W,
    height: 8,
    color: PWC_ORANGE,
  });
  let cursor: DrawCursor = { page, y: PAGE_H - MARGIN_Y - 20 };
  cursor = drawText(doc, cursor, "SafeMate · TBM 보고서", {
    font,
    size: 22,
    color: PWC_INK,
    sanitizeForLatin: sanitize,
  });
  cursor.y -= 8;
  drawDivider(cursor.page, cursor.y, PWC_ORANGE);
  cursor.y -= 18;
  cursor = drawKv(
    doc,
    cursor,
    "작업명 (WORK)",
    session.work_type_label || session.work_type || "(미입력)",
    fonts,
  );
  cursor = drawKv(
    doc,
    cursor,
    "도메인 (DOMAIN)",
    session.domain ? DOMAIN_LABEL_KO_LOCAL[session.domain] ?? session.domain : "(미지정)",
    fonts,
  );
  cursor = drawKv(
    doc,
    cursor,
    "생성 (GENERATED)",
    new Date().toLocaleString("ko-KR"),
    fonts,
  );
  cursor = drawKv(
    doc,
    cursor,
    "세션 ID (SESSION)",
    session.session_id,
    fonts,
  );
  if (!fonts.hasKorean) {
    cursor.y -= 6;
    cursor = drawText(doc, cursor, "[FONT WARNING] Korean font not loaded — install /fonts/NotoSansKR-VariableFont_wght.ttf for full Korean rendering.", {
      font: fonts.latin,
      size: 8,
      color: PWC_INK_MUTE,
      sanitizeForLatin: true,
    });
  }

  // ── §1. 사전 정보 ──────────────────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "1. 사전 정보 (PRIOR INFO)", fonts);
  const priorLines: string[] = [];
  if (session.prior_info?.workLocation) priorLines.push(`작업 위치: ${session.prior_info.workLocation}`);
  if (session.prior_info?.workContentDetails) priorLines.push(`작업 내용: ${session.prior_info.workContentDetails}`);
  if (session.prior_info?.numberOfWorkers !== undefined)
    priorLines.push(`작업자 수: ${session.prior_info.numberOfWorkers}명`);
  if (session.prior_info?.equipmentDetails) priorLines.push(`장비: ${session.prior_info.equipmentDetails}`);
  if (priorLines.length === 0) priorLines.push("(미입력)");
  cursor = drawBullets(doc, cursor, priorLines, fonts);

  // ── §2. 최종 요약 ──────────────────────────────────────────
  if (session.final_summary) {
    cursor = drawSectionHeader(doc, cursor, "2. 최종 요약 (FINAL SUMMARY)", fonts);
    cursor = drawText(doc, cursor, session.final_summary, {
      font,
      size: 11,
      color: PWC_INK,
      sanitizeForLatin: sanitize,
    });
  }

  // ── §3. 체크리스트 (completed) ─────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "3. 체크리스트 (CHECKLIST)", fonts);
  const items = session.checklist_items ?? [];
  if (items.length === 0) {
    cursor = drawText(doc, cursor, "(체크리스트 없음)", {
      font,
      size: 11,
      color: PWC_INK_MUTE,
      sanitizeForLatin: sanitize,
    });
  } else {
    for (const it of items) {
      const mark = it.completed ? "[O]" : "[ ]";
      cursor = drawText(doc, cursor, `${mark} ${it.content}`, {
        font,
        size: 11,
        color: PWC_INK,
        indent: 6,
        sanitizeForLatin: sanitize,
      });
    }
  }

  // ── §4. 8필드 구조화 ──────────────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "4. 위험·대응 정리 (STRUCTURED)", fonts);
  cursor = drawStructured(doc, cursor, session.structured ?? {}, fonts);

  // ── §5. 참석자 + 서명 ─────────────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "5. 참석자 (ATTENDEES)", fonts);
  if (attendees.length === 0) {
    cursor = drawText(doc, cursor, "(참석자 미입력)", {
      font,
      size: 11,
      color: PWC_INK_MUTE,
      sanitizeForLatin: sanitize,
    });
  } else {
    for (const a of attendees) {
      cursor = await drawAttendeeRow(doc, cursor, a, fonts);
    }
  }

  // ── §6. 인용 출처 ─────────────────────────────────────────
  const allCitations = (session.citations ?? []).flatMap((c) => c.citations);
  if (allCitations.length > 0) {
    cursor = drawSectionHeader(doc, cursor, "6. 인용 출처 (REFERENCES)", fonts);
    for (const c of allCitations) {
      cursor = drawText(doc, cursor, `· ${c.title}`, {
        font,
        size: 10,
        color: PWC_INK,
        indent: 6,
        sanitizeForLatin: sanitize,
      });
      if (c.url) {
        cursor = drawText(doc, cursor, c.url, {
          font: fonts.latin, // URL은 항상 latin
          size: 8,
          color: PWC_INK_SOFT,
          indent: 12,
          sanitizeForLatin: true,
        });
      }
    }
  }

  // ── 푸터 ──────────────────────────────────────────────────
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i += 1) {
    const p = pages[i];
    p.drawText(`SafeMate · ${i + 1} / ${pages.length}`, {
      x: MARGIN_X,
      y: 24,
      size: 8,
      color: PWC_INK_MUTE,
      font: fonts.latin,
    });
  }

  const bytes = await doc.save();
  // Uint8Array는 Blob 생성자가 받지 못하는 빌드 환경이 있어 명시 ArrayBuffer 변환.
  // (slice는 새로운 ArrayBuffer를 반환 — SharedArrayBuffer 회피.)
  return new Blob([bytes.slice().buffer], { type: "application/pdf" });
}

function drawStructured(
  doc: PDFDocument,
  start: DrawCursor,
  s: StructuredChecklist,
  fonts: FontPair,
): DrawCursor {
  let c = start;
  const font = fonts.hasKorean ? fonts.uni : fonts.latin;
  const sanitize = !fonts.hasKorean;
  const sec = (label: string, value: string | string[] | undefined) => {
    c = drawText(doc, c, label, {
      font,
      size: 10,
      color: PWC_INK_MUTE,
      sanitizeForLatin: sanitize,
    });
    if (Array.isArray(value)) {
      if (value.length === 0) {
        c = drawText(doc, c, "—", { font, size: 11, color: PWC_INK_MUTE, indent: 6, sanitizeForLatin: sanitize });
      } else {
        c = drawBullets(doc, c, value, fonts);
      }
    } else {
      c = drawText(doc, c, value || "—", {
        font,
        size: 11,
        color: value ? PWC_INK : PWC_INK_MUTE,
        indent: 6,
        sanitizeForLatin: sanitize,
      });
    }
    c.y -= 4;
  };
  sec("오늘 작업 내용", s.work_summary);
  sec("평소와 달라진 점", s.changes_today);
  sec("주요 위험요인", s.hazards);
  sec("위험 시나리오", s.risk_scenarios);
  sec("대응/예방 조치", s.mitigations);
  sec("보호구/장비 확인", s.ppe);
  sec("특이사항", s.special_notes);
  return c;
}

// ──────────────────────────────────────────────────────────────
// Phase 2.x PR-6 — Broadcast Report PDF (전파 확인서).
// ──────────────────────────────────────────────────────────────
// 8 섹션 (felix 명세):
//   1. 헤더: "TBM 전파 확인서" + 회사 로고 placeholder + timestamp
//   2. 작업 정보: domain · work_type_label · 작업자 수 · session_id
//   3. 사전 컨텍스트: prepared_context 6필드 표
//   4. 위험요인·시나리오·대응·PPE: structured.{hazards,risk_scenarios,mitigations,ppe}
//      + baseline per-item 매핑(PR-1)
//   5. 체크리스트 진행: 항목별 ✓ + checkedAt + utterance 인용
//   6. 특이사항: structured.special_notes
//   7. 참석 확인: structured.attendance_confirmed + (옵션) attendees 명단
//   8. 리더 서명: PNG 이미지 + signed_at + worker_count_attested
//
// 폰트:
//   - NotoSansKR subset 우선 (loadFonts에서 fetch).
//   - 미설치 시 Helvetica fallback + ASCII sanitize + 표지에 [FONT WARNING] 노출
//     (felix Q6=A 권장).

/** Date-only YYYYMMDD 포맷 (파일명용). */
function formatYyyymmddHhmm(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "00000000-0000";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  } catch {
    return "00000000-0000";
  }
}

/** Blob → Uint8Array (PDF embedPng 입력용). */
async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/** §3 prepared_context 6필드 표 출력. */
function drawPreparedContextTable(
  doc: PDFDocument,
  start: DrawCursor,
  session: Session,
  fonts: FontPair,
): DrawCursor {
  let c = start;
  const ctx = session.prepared_context;
  const rows: { label: string; value: string }[] = [
    { label: "작업자 수", value: ctx?.worker_count !== undefined ? `${ctx.worker_count}명` : "—" },
    { label: "교대", value: ctx?.shift ?? "—" },
    { label: "풍속", value: ctx?.wind_speed_mps !== undefined ? `${ctx.wind_speed_mps} m/s` : "—" },
    { label: "신규 자재", value: ctx?.new_material ?? "—" },
    { label: "특이사항", value: ctx?.special_notes ?? "—" },
    {
      label: "과거 사고 키워드",
      value:
        ctx?.previous_incident_keywords && ctx.previous_incident_keywords.length > 0
          ? ctx.previous_incident_keywords.join(", ")
          : "—",
    },
  ];
  for (const r of rows) {
    c = drawKv(doc, c, r.label, r.value, fonts);
  }
  return c;
}

/** §4 hazards/scenarios/mitigations/ppe + per-item 매핑(PR-1).
 *  prepared_baseline[i].scenarios/mitigations/ppe가 있으면 hazards 항목별로
 *  하위 1~2개 bullet로 표시. 없으면 structured.* flat 배열만. */
function drawStructuredWithMapping(
  doc: PDFDocument,
  start: DrawCursor,
  s: StructuredChecklist,
  baseline: PreparedBaselineItem[] | undefined,
  fonts: FontPair,
): DrawCursor {
  let c = start;
  const font = fonts.hasKorean ? fonts.uni : fonts.latin;
  const sanitize = !fonts.hasKorean;
  const baselineHasMapping = (baseline ?? []).some(
    (b) =>
      (b.scenarios && b.scenarios.length > 0) ||
      (b.mitigations && b.mitigations.length > 0) ||
      (b.ppe && b.ppe.length > 0),
  );

  // 4.1 주요 위험요인 — per-item 매핑 사용 가능하면 hazard별 sub-section.
  c = drawText(doc, c, "주요 위험요인", { font, size: 12, color: PWC_INK, sanitizeForLatin: sanitize });
  const hazardArr = s.hazards ?? [];
  if (hazardArr.length === 0) {
    c = drawText(doc, c, "—", { font, size: 11, color: PWC_INK_MUTE, indent: 6, sanitizeForLatin: sanitize });
  } else if (baselineHasMapping && baseline) {
    // baseline 순으로 정렬 — content 매칭. matched 항목에 sub-bullet.
    for (const b of baseline) {
      c = drawText(doc, c, `• ${b.content}`, {
        font,
        size: 11,
        color: PWC_INK,
        indent: 6,
        sanitizeForLatin: sanitize,
      });
      const subItems: string[] = [];
      for (const sc of b.scenarios ?? []) subItems.push(`시나리오: ${sc.content}`);
      for (const m of b.mitigations ?? []) subItems.push(`대응: ${m.content}`);
      for (const p of b.ppe ?? []) subItems.push(`PPE: ${p.content}`);
      for (const sub of subItems) {
        c = drawText(doc, c, `  – ${sub}`, {
          font,
          size: 10,
          color: PWC_INK_SOFT,
          indent: 12,
          sanitizeForLatin: sanitize,
        });
      }
    }
    // baseline 외 추가 hazards (수동 추가된 항목) flat list로.
    const baselineContents = new Set((baseline ?? []).map((b) => b.content));
    const extras = hazardArr.filter((h) => !baselineContents.has(h));
    for (const e of extras) {
      c = drawText(doc, c, `• ${e}`, {
        font,
        size: 11,
        color: PWC_INK,
        indent: 6,
        sanitizeForLatin: sanitize,
      });
    }
  } else {
    c = drawBullets(doc, c, hazardArr, fonts);
  }
  c.y -= 4;

  // 4.2 위험 시나리오 (flat — 매핑은 위 4.1에서 이미 노출됨).
  c = drawText(doc, c, "위험 시나리오", { font, size: 12, color: PWC_INK, sanitizeForLatin: sanitize });
  const scenarios = s.risk_scenarios ?? [];
  if (scenarios.length === 0) {
    c = drawText(doc, c, "—", { font, size: 11, color: PWC_INK_MUTE, indent: 6, sanitizeForLatin: sanitize });
  } else {
    c = drawBullets(doc, c, scenarios, fonts);
  }
  c.y -= 4;

  // 4.3 대응/예방.
  c = drawText(doc, c, "대응/예방 조치", { font, size: 12, color: PWC_INK, sanitizeForLatin: sanitize });
  const mits = s.mitigations ?? [];
  if (mits.length === 0) {
    c = drawText(doc, c, "—", { font, size: 11, color: PWC_INK_MUTE, indent: 6, sanitizeForLatin: sanitize });
  } else {
    c = drawBullets(doc, c, mits, fonts);
  }
  c.y -= 4;

  // 4.4 보호구.
  c = drawText(doc, c, "보호구", { font, size: 12, color: PWC_INK, sanitizeForLatin: sanitize });
  const ppe = s.ppe ?? [];
  if (ppe.length === 0) {
    c = drawText(doc, c, "—", { font, size: 11, color: PWC_INK_MUTE, indent: 6, sanitizeForLatin: sanitize });
  } else {
    c = drawBullets(doc, c, ppe, fonts);
  }
  c.y -= 4;

  return c;
}

/** §5 체크리스트 진행 — 항목별 ✓ + checkedAt + utterance. */
function drawChecklistProgress(
  doc: PDFDocument,
  start: DrawCursor,
  items: ChecklistItem[],
  fonts: FontPair,
): DrawCursor {
  let c = start;
  const font = fonts.hasKorean ? fonts.uni : fonts.latin;
  const sanitize = !fonts.hasKorean;
  if (items.length === 0) {
    c = drawText(doc, c, "(체크리스트 없음)", {
      font,
      size: 11,
      color: PWC_INK_MUTE,
      sanitizeForLatin: sanitize,
    });
    return c;
  }
  for (const it of items) {
    const mark = it.completed ? "[O]" : "[ ]";
    const baselineLabel = it.is_baseline ? " (필수)" : "";
    c = drawText(doc, c, `${mark} ${it.content}${baselineLabel}`, {
      font,
      size: 11,
      color: PWC_INK,
      indent: 6,
      sanitizeForLatin: sanitize,
    });
    if (it.completed) {
      const time = it.checkedAt ? formatHhmm(it.checkedAt) : "";
      const meta: string[] = [];
      if (time) meta.push(time);
      if (it.utterance) meta.push(`"${it.utterance}"`);
      if (meta.length > 0) {
        c = drawText(doc, c, meta.join(" · "), {
          font,
          size: 9,
          color: PWC_INK_SOFT,
          indent: 16,
          sanitizeForLatin: sanitize,
        });
      }
    }
  }
  return c;
}

function formatHhmm(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

/** §8 리더 서명 — PNG + signed_at + worker_count_attested + method. */
async function drawLeaderSignature(
  doc: PDFDocument,
  start: DrawCursor,
  attestation: LeaderAttestation,
  signatureBlob: Blob,
  fonts: FontPair,
): Promise<DrawCursor> {
  let c = start;
  const font = fonts.hasKorean ? fonts.uni : fonts.latin;
  const sanitize = !fonts.hasKorean;

  // 메타 — 서명 시각 + worker_count + method.
  c = drawKv(
    doc,
    c,
    "서명 시각",
    new Date(attestation.signed_at).toLocaleString("ko-KR"),
    fonts,
  );
  c = drawKv(
    doc,
    c,
    "전파 작업자 수",
    `${attestation.worker_count_attested}명`,
    fonts,
  );
  c = drawKv(
    doc,
    c,
    "서명 방식",
    attestation.method === "canvas" ? "캔버스 서명" : "본인 동의 확인 (체크박스)",
    fonts,
  );

  // PNG 이미지 — canvas 서명만 시각 표시. checkbox는 텍스트만.
  if (attestation.method === "canvas") {
    try {
      const bytes = await blobToBytes(signatureBlob);
      const img = await doc.embedPng(bytes);
      // 페이지 넘김 가드 — 서명 이미지 + 라벨에 ~120pt 필요.
      if (c.y < MARGIN_Y + 120) {
        c = { page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN_Y };
      }
      const targetW = 200;
      const ratio = img.height / Math.max(img.width, 1);
      const targetH = Math.min(80, targetW * ratio);
      c.page.drawImage(img, {
        x: MARGIN_X + 6,
        y: c.y - targetH - 4,
        width: targetW,
        height: targetH,
      });
      c.y -= targetH + 12;
      // 서명 박스 테두리 — visual confirmation.
      c.page.drawRectangle({
        x: MARGIN_X + 6,
        y: c.y + 6,
        width: targetW,
        height: targetH,
        borderColor: PWC_BORDER,
        borderWidth: 0.5,
      });
    } catch (err) {
      console.warn("[pdfGenerate] leader signature embedPng failed:", err);
      c = drawText(doc, c, "(서명 이미지 임베드 실패)", {
        font,
        size: 10,
        color: PWC_INK_MUTE,
        indent: 6,
        sanitizeForLatin: sanitize,
      });
    }
  } else {
    c = drawText(doc, c, "(체크박스 폴백 — 서명 이미지 없음)", {
      font,
      size: 10,
      color: PWC_INK_MUTE,
      indent: 6,
      sanitizeForLatin: sanitize,
    });
  }
  return c;
}

/** Broadcast 전파 확인서 PDF 생성. PR-6 메인 export. */
export async function generateBroadcastReportPdf(
  session: Session,
  attestation: LeaderAttestation,
  signatureBlob: Blob,
): Promise<Blob> {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const sanitize = !fonts.hasKorean;
  const font = fonts.hasKorean ? fonts.uni : fonts.latin;

  // ── §1. 헤더(표지) ────────────────────────────────────────
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 8,
    width: PAGE_W,
    height: 8,
    color: PWC_ORANGE,
  });
  let cursor: DrawCursor = { page, y: PAGE_H - MARGIN_Y - 20 };
  cursor = drawText(doc, cursor, "TBM 전파 확인서", {
    font,
    size: 24,
    color: PWC_INK,
    sanitizeForLatin: sanitize,
  });
  cursor.y -= 4;
  cursor = drawText(doc, cursor, "TBM Broadcast Attestation Report", {
    font: fonts.latin,
    size: 11,
    color: PWC_INK_MUTE,
    sanitizeForLatin: true,
  });
  cursor.y -= 4;
  drawDivider(cursor.page, cursor.y, PWC_ORANGE);
  cursor.y -= 12;
  cursor = drawKv(doc, cursor, "회사", "SafeMate · PwC", fonts);
  cursor = drawKv(
    doc,
    cursor,
    "발행 시각",
    new Date().toLocaleString("ko-KR"),
    fonts,
  );
  if (!fonts.hasKorean) {
    cursor.y -= 6;
    cursor = drawText(
      doc,
      cursor,
      "[FONT WARNING] Korean font not installed — ASCII fallback applied. Install /fonts/NotoSansKR-VariableFont_wght.ttf for full Korean rendering.",
      {
        font: fonts.latin,
        size: 8,
        color: PWC_INK_MUTE,
        sanitizeForLatin: true,
      },
    );
  }

  // ── §2. 작업 정보 ─────────────────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "1. 작업 정보 (WORK)", fonts);
  cursor = drawKv(
    doc,
    cursor,
    "도메인",
    session.domain
      ? DOMAIN_LABEL_KO_LOCAL[session.domain] ?? session.domain
      : "(미지정)",
    fonts,
  );
  cursor = drawKv(
    doc,
    cursor,
    "작업명",
    session.work_type_label || session.work_type_id || session.work_type || "(미입력)",
    fonts,
  );
  cursor = drawKv(
    doc,
    cursor,
    "전파 작업자 수",
    `${attestation.worker_count_attested}명`,
    fonts,
  );
  cursor = drawKv(doc, cursor, "세션 ID", session.session_id, fonts);

  // ── §3. 사전 컨텍스트 ─────────────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "2. 사전 컨텍스트 (PREPARED CONTEXT)", fonts);
  cursor = drawPreparedContextTable(doc, cursor, session, fonts);

  // ── §4. 위험요인·시나리오·대응·PPE ────────────────────────
  cursor = drawSectionHeader(doc, cursor, "3. 위험·대응 (HAZARDS · MITIGATIONS)", fonts);
  cursor = drawStructuredWithMapping(
    doc,
    cursor,
    session.structured ?? {},
    session.prepared_baseline,
    fonts,
  );

  // ── §5. 체크리스트 진행 ───────────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "4. 체크리스트 진행 (CHECKLIST)", fonts);
  cursor = drawChecklistProgress(doc, cursor, session.checklist_items ?? [], fonts);

  // ── §6. 특이사항 ──────────────────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "5. 특이사항 (SPECIAL NOTES)", fonts);
  const specialNotes = session.structured?.special_notes;
  if (specialNotes && specialNotes.trim().length > 0) {
    cursor = drawText(doc, cursor, specialNotes, {
      font,
      size: 11,
      color: PWC_INK,
      sanitizeForLatin: sanitize,
    });
  } else {
    cursor = drawText(doc, cursor, "(없음)", {
      font,
      size: 11,
      color: PWC_INK_MUTE,
      sanitizeForLatin: sanitize,
    });
  }

  // ── §7. 참석 확인 ─────────────────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "6. 참석 확인 (ATTENDANCE)", fonts);
  cursor = drawKv(
    doc,
    cursor,
    "참석 확인 여부",
    session.structured?.attendance_confirmed ? "확인됨" : "미확인",
    fonts,
  );
  const attList = session.attendees ?? [];
  if (attList.length > 0) {
    cursor = drawText(doc, cursor, "참석자 명단", {
      font,
      size: 10,
      color: PWC_INK_MUTE,
      sanitizeForLatin: sanitize,
    });
    for (const a of attList) {
      const role = a.role ? ` · ${a.role}` : "";
      const sig = a.signed
        ? a.signature_data_url
          ? " [서명]"
          : " [동의 확인]"
        : "";
      cursor = drawText(doc, cursor, `· ${a.name}${role}${sig}`, {
        font,
        size: 11,
        color: PWC_INK,
        indent: 6,
        sanitizeForLatin: sanitize,
      });
    }
  }

  // ── §8. 리더 서명 ─────────────────────────────────────────
  cursor = drawSectionHeader(doc, cursor, "7. 리더 서명 (LEADER ATTESTATION)", fonts);
  cursor = await drawLeaderSignature(doc, cursor, attestation, signatureBlob, fonts);

  // ── 푸터 ──────────────────────────────────────────────────
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i += 1) {
    const p = pages[i];
    p.drawText(`SafeMate · TBM Broadcast Report · ${i + 1} / ${pages.length}`, {
      x: MARGIN_X,
      y: 24,
      size: 8,
      color: PWC_INK_MUTE,
      font: fonts.latin,
    });
  }

  const bytes = await doc.save();
  return new Blob([bytes.slice().buffer], { type: "application/pdf" });
}

/** PR-6 권장 파일명 빌더 — TBM_{domain}_{work_type_id_sanitized}_{YYYYMMDD-HHmm}.pdf */
export function buildBroadcastReportFilename(session: Session): string {
  const domain = session.domain ?? "general";
  const rawId = session.work_type_id ?? session.work_type ?? "tbm";
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const stamp = formatYyyymmddHhmm(new Date().toISOString());
  return `TBM_${domain}_${safeId || "tbm"}_${stamp}.pdf`;
}
