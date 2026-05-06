// HazardResultCard — PR C (vision 결과) + PR E 5종 카드 마이그레이션.
//
// PR E (c6 §3.VI): 각 hazard 행을 신규 `<HazardCard>` 통일 컴포넌트로 재구성.
// 외부 API는 PR C 그대로 유지 — ChatList 호출부 변경 0.
//   - 카드 헤더(사진 분석 제목·summary)와 bbox overlay는 본 파일에 유지(사진별
//     1건 컨테이너 역할).
//   - hazard 1건당 HazardCard(source="vision", autoBoosted, added, onAdd/onUndo)
//     로 표현.
//
// invariants:
//   #10: expanded 등 view state 비영속.
//   PR C anchor index drift(c5 §13 #6) 동작 그대로.

import { useEffect, useRef, useState } from "react";
import type { MediaAttachment, HazardDetection } from "../services/sessionModel";
import type { HazardDetectionResponse } from "../services/visionAnalyze";
import { getAttachmentBlob } from "../services/attachmentStore";
import { HazardOverlay } from "./HazardOverlay";
import { HazardCard } from "../shared/ui/cards";

interface HazardResultCardProps {
  /** 결과의 원본 첨부 메타 — bbox 좌표 정합 + 미리보기. */
  attachment: MediaAttachment;
  /** vision-analyze 응답 (정규화된 형태). */
  result: HazardDetectionResponse;
  /** Session.hazard_detections 중 attachment_id가 일치하는 항목 — bbox overlay
   *  + structured_anchor_idx undo용. */
  detections: HazardDetection[];
  /** 부모가 structured.hazards에 항목 추가/제거를 수행. 카드는 호출만.
   *  EHS 모드에서는 두 콜백 모두 undefined로 전달되어 footer 버튼이 미렌더된다
   *  (2026-05-06 felix HITL — EHS는 체크리스트 없는 Q&A 모드). */
  onAddToStructured?: (detectionId: string) => void;
  onUndoFromStructured?: (detectionId: string) => void;
}

const AUTO_BOOST_THRESHOLD = 0.7;

export function HazardResultCard({
  attachment,
  result,
  detections,
  onAddToStructured,
  onUndoFromStructured,
}: HazardResultCardProps) {
  const [expanded, setExpanded] = useState<boolean>(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // 사진 blob을 한 번 로드 — bbox overlay 시각화에 필요.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const blob = await getAttachmentBlob(attachment.blob_ref);
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setImageUrl(url);
    })();
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [attachment.blob_ref]);

  const hazardCount = result.hazards.length;
  const headerText =
    hazardCount === 0
      ? "특이 위험 미식별 — 추가 검토는 직접 입력하세요"
      : `위험 ${hazardCount}건 감지`;

  return (
    <div className="bg-pwc-bg border border-pwc-border rounded-pwc-lg shadow-pwc-card p-3 text-left">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange rounded-pwc"
        aria-expanded={expanded}
      >
        <span className="text-[10px] uppercase tracking-wider text-pwc-orange font-bold">
          사진 분석
        </span>
        <span className="text-xs text-pwc-ink font-semibold">{headerText}</span>
        <span className="ml-auto text-[10px] text-pwc-ink-soft">
          {expanded ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>

      {result.summary && (
        <p className="mt-2 text-[12px] text-pwc-ink-soft leading-snug">
          {result.summary}
        </p>
      )}

      {expanded && hazardCount > 0 && (
        <>
          {/* bbox overlay 미리보기 — 작은 미리보기. */}
          {imageUrl && (
            <div className="relative mt-2 rounded-pwc overflow-hidden border border-pwc-border-strong bg-black/5">
              <img
                src={imageUrl}
                alt={attachment.caption ?? "분석 사진"}
                className="block w-full h-auto"
              />
              <HazardOverlay detections={detections} />
            </div>
          )}

          <ul className="mt-3 space-y-2">
            {result.hazards.map((h, i) => {
              const detection = detections[i]; // 인덱스 정합 (visionAnalyze 응답 순서 = detections 순서)
              const detectionId = detection?.id ?? `tmp-${i}`;
              const isAutoBoosted = h.confidence >= AUTO_BOOST_THRESHOLD;
              const anchorIdx = detection?.structured_anchor_idx;
              const anchored = anchorIdx !== undefined && anchorIdx !== null;
              return (
                <li key={detectionId}>
                  <HazardCard
                    hazard={`${i + 1}. ${h.hazard}`}
                    rationale={
                      h.suggested_mitigation
                        ? `${h.rationale}\n대응: ${h.suggested_mitigation}`
                        : h.rationale
                    }
                    confidence={h.confidence}
                    domainTag={h.domain_tag}
                    source="vision"
                    autoBoosted={isAutoBoosted}
                    added={anchored}
                    onAdd={
                      onAddToStructured
                        ? () => onAddToStructured(detectionId)
                        : undefined
                    }
                    onUndo={
                      onUndoFromStructured
                        ? () => onUndoFromStructured(detectionId)
                        : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
