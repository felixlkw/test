// catalogI18n.ts — v0.2.6 PR-5 카탈로그 다국어 분기 헬퍼.
//
// 배경:
//   v0.2.5까지 정적 카탈로그(`frontend/src/generated/catalog/{domain}.json`)는
//   한국어(`content`, `label_ko`) + 영어(`label_en`)만 존재. 비-한국어 사용자에게는
//   1단 카탈로그가 한국어로 노출되고 "AI가 곧 {언어}로 보강합니다" 마이크로카피로
//   안내했음.
//
// v0.2.6:
//   각 텍스트 항목에 `content_en`, `content_vi`, `content_th`, `content_id`
//   옵셔널 필드 추가. work_type label도 `label_vi`/`label_th`/`label_id` 추가.
//   기존 `content`(한국어) / `label_ko` / `label_en` 필드는 그대로 유지(후방 호환).
//
//   본 모듈은 SessionLanguage(한·영·베·태·인니)에서 카탈로그 항목의 적절한
//   현지어 텍스트를 골라 반환한다. 현지어 필드가 없으면 ko(기존 `content`/`label_ko`)
//   폴백 — 카탈로그 JSON이 다국어로 채워지지 않은 도메인/항목에서도 정상 동작.
//
// 후방 호환:
//   - 모든 추가 필드 옵셔널. 기존 v0.2.5 카탈로그(다국어 필드 없음) → 모두 ko 폴백.
//   - SessionLanguage = "korean" → 항상 ko `content` 직접 사용.
//   - English / Vietnamese / Thai / Indonesian → `content_<lang>` 우선, 없으면 ko.

import type { SessionLanguage } from "./sessionModel";

// ---------------------------------------------------------------------------
// SessionLanguage("korean"|"english"|...) → JSON 필드 suffix("ko"|"en"|...)
// 매핑. catalogQuick.ts의 RawCatalog 스키마와 일치하는 키만.
// ---------------------------------------------------------------------------
type CatalogLangCode = "ko" | "en" | "vi" | "th" | "id";

function toLangCode(language: SessionLanguage): CatalogLangCode {
  switch (language) {
    case "korean":
      return "ko";
    case "english":
      return "en";
    case "vietnamese":
      return "vi";
    case "thai":
      return "th";
    case "indonesian":
      return "id";
    default:
      // 미래의 신규 언어는 ko로 폴백 — 카탈로그 미준비라도 안전.
      return "ko";
  }
}

// ---------------------------------------------------------------------------
// 카탈로그 항목 텍스트 picker. content_en/vi/th/id 우선, 없으면 ko 폴백.
//
// 인자 `item`은 카탈로그 JSON의 텍스트 항목 — content + content_en/vi/th/id
// 옵셔널 필드만 알면 됨. 각 호출처(catalogQuick.ts의 RawBaseline/RawPerItem
// 등)는 동일한 옵셔널 필드 셋을 갖는다.
// ---------------------------------------------------------------------------

/** content 텍스트 picker가 사용하는 옵셔널 필드 집합.
 *  ts strict 환경에서 index signature 없이도 catalogQuick.ts의 Raw* 타입과
 *  구조적 호환되도록 모든 필드 옵셔널 unknown으로 선언. */
export interface CatalogContentItem {
  content?: unknown;
  content_en?: unknown;
  content_vi?: unknown;
  content_th?: unknown;
  content_id?: unknown;
}

/** label 텍스트 picker가 사용하는 옵셔널 필드 집합. */
export interface CatalogLabelItem {
  label_ko?: unknown;
  label_en?: unknown;
  label_vi?: unknown;
  label_th?: unknown;
  label_id?: unknown;
}

/** 카탈로그 텍스트 항목에서 현재 언어에 맞는 content 문자열을 고른다.
 *
 *  반환값은 항상 string — 항목에 ko/현지어 모두 없으면 빈 문자열.
 *  caller가 별도 빈 문자열 가드를 두지 않아도 안전.
 *
 *  예:
 *    pickContent({ content: "안전모 착용", content_en: "Wear hard hat" }, "english")
 *      → "Wear hard hat"
 *    pickContent({ content: "안전모 착용" }, "english")  // 현지어 없음 → ko 폴백
 *      → "안전모 착용"
 */
export function pickContent(
  item: CatalogContentItem,
  language: SessionLanguage,
): string {
  const code = toLangCode(language);
  // ko는 기존 `content` 필드 직접 사용 — 별도 `content_ko` 필드는 정의되지 않음.
  if (code === "ko") {
    return typeof item.content === "string" ? item.content : "";
  }
  const localized = pickByCode(item, code);
  if (typeof localized === "string" && localized.length > 0) {
    return localized;
  }
  // 폴백: ko `content`.
  return typeof item.content === "string" ? item.content : "";
}

function pickByCode(item: CatalogContentItem, code: CatalogLangCode): unknown {
  switch (code) {
    case "en":
      return item.content_en;
    case "vi":
      return item.content_vi;
    case "th":
      return item.content_th;
    case "id":
      return item.content_id;
    case "ko":
      return item.content;
    default:
      return undefined;
  }
}

/** work_type 카드 라벨 picker.
 *
 *  ko/en은 기존 `label_ko`/`label_en` 필드. vi/th/id는 신규 `label_vi`/`label_th`/`label_id`.
 *  현지어 라벨 없으면 ko 폴백.
 */
export function pickLabel(
  workType: CatalogLabelItem,
  language: SessionLanguage,
): string {
  const code = toLangCode(language);
  if (code === "ko") {
    return typeof workType.label_ko === "string" ? workType.label_ko : "";
  }
  if (code === "en") {
    if (typeof workType.label_en === "string" && workType.label_en.length > 0) {
      return workType.label_en;
    }
    return typeof workType.label_ko === "string" ? workType.label_ko : "";
  }
  const localized = pickLabelByCode(workType, code);
  if (typeof localized === "string" && localized.length > 0) {
    return localized;
  }
  // 폴백: ko `label_ko`.
  return typeof workType.label_ko === "string" ? workType.label_ko : "";
}

function pickLabelByCode(
  workType: CatalogLabelItem,
  code: CatalogLangCode,
): unknown {
  switch (code) {
    case "ko":
      return workType.label_ko;
    case "en":
      return workType.label_en;
    case "vi":
      return workType.label_vi;
    case "th":
      return workType.label_th;
    case "id":
      return workType.label_id;
    default:
      return undefined;
  }
}

/** 현재 언어에서 항목이 ko 폴백을 사용 중인지 판정.
 *
 *  `content_only_ko_fallback` 플래그 계산용. language="korean"이면 ko가 곧
 *  primary 라 항상 false. 비-한국어에서 `content_<lang>` 필드가 비어있으면 true.
 *
 *  pickContent와 동일한 우선순위 규칙을 따른다 — 단, "ko 폴백" 판정은 현지어 필드의
 *  존재/비존재만 본다(빈 문자열도 폴백으로 간주).
 */
export function isKoFallback(
  item: CatalogContentItem,
  language: SessionLanguage,
): boolean {
  const code = toLangCode(language);
  if (code === "ko") return false;
  const localized = pickByCode(item, code);
  return !(typeof localized === "string" && localized.length > 0);
}
