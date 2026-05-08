// ChatList — Cycle 3 chat-log-centric paradigm.
// 메인 영역. 메신저 스타일 bubble + system inline + assistant 메시지 아래 inline citation/recommended.
// PR C — 메시지의 attachment_ids에 매칭되는 MediaAttachment를 inline 썸네일로,
// hazard_detections에 매칭되는 결과를 HazardResultCard로 inline 표시.
import { useEffect, useMemo, useRef, useState } from "react";
import { IconClose, IconDoc } from "../../components/Icon";
import type { ChatMessage, AppMode, CitationDisplay } from "../../features/tbm/types";
import type {
  HazardDetection,
  MediaAttachment,
} from "../../services/sessionModel";
import type { HazardDetectionResponse } from "../../services/visionAnalyze";
import { AttachmentPreview } from "../../components/AttachmentPreview";
import { HazardResultCard } from "../../components/HazardResultCard";
import { IncidentCaseCard } from "../ui/cards";

interface ChatListProps {
  messages: ChatMessage[];
  currentMode: AppMode;
  /** assistant talking 시 typing dots 노출. */
  talking: "idle" | "user" | "assistant";
  /** 빈 chat 상태에서 안내. AI가 자동 시작 후 곧 첫 인사가 들어옴. */
  connecting: boolean;
  sessionActive: boolean;
  /** Cycle 3: cueMessage는 system 메시지로 inline 표시. 가장 아래에 1건. */
  cueMessage: string;
  /** Cycle 3 Option C: citations는 가장 최신 assistant 메시지 아래 inline 카드(최신 1건 펼침 + 이전 토글). */
  citations: CitationDisplay[];
  onClearCitations: () => void;
  /** Cycle 3: 추천질문(EHS, citations 없을 때)을 chat 안 chip row로. */
  showRecommendedChips: boolean;
  recommendedQuestions: string[];
  recommendedAnimatingOut: boolean;
  onClickRecommendedQuestion: (q: string) => void;
  /** PR D Q5 (OLD-M11): hover/focus 시 회전 일시정지. parent가 boolean toggle. */
  onRecommendedHoverChange?: (hovered: boolean) => void;
  /** PR D Q5: "↻ 다른 질문" 버튼 클릭 시 즉시 회전. */
  onRotateRecommended?: () => void;
  // ── PR C — attachments + vision 결과 ──────────────────────────────
  /** 세션에 누적된 MediaAttachment (옵셔널). 메시지의 attachment_ids로 lookup. */
  attachments?: MediaAttachment[];
  /** 세션에 누적된 vision 결과 (옵셔널). HazardResultCard 렌더에 필요. */
  hazardDetections?: HazardDetection[];
  /** structured.hazards 자동 보강 + undo 핸들러 — VoiceShell이 owner. */
  onAddDetectionToStructured?: (detectionId: string) => void;
  onUndoDetectionFromStructured?: (detectionId: string) => void;
  /** Phase chat-PR3: 메시지 actions 클릭 핸들러. messageIdx + actionId. */
  onMessageAction?: (
    messageIdx: number,
    actionId: "retry_voice" | "continue_chat",
  ) => void;
}

export function ChatList({
  messages,
  currentMode,
  talking,
  connecting,
  sessionActive,
  cueMessage,
  citations,
  onClearCitations,
  showRecommendedChips,
  recommendedQuestions,
  recommendedAnimatingOut,
  onClickRecommendedQuestion,
  onRecommendedHoverChange,
  onRotateRecommended,
  attachments,
  hazardDetections,
  onAddDetectionToStructured,
  onMessageAction,
  onUndoDetectionFromStructured,
}: ChatListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // PR C — 빠른 lookup을 위한 인덱스. id -> MediaAttachment.
  const attachmentById = useMemo(() => {
    const map = new Map<string, MediaAttachment>();
    for (const a of attachments ?? []) map.set(a.id, a);
    return map;
  }, [attachments]);

  // PR C — attachment_id -> HazardDetection[]. 메시지 inline HazardResultCard용.
  const detectionsByAttachmentId = useMemo(() => {
    const map = new Map<string, HazardDetection[]>();
    for (const d of hazardDetections ?? []) {
      const arr = map.get(d.attachment_id) ?? [];
      arr.push(d);
      map.set(d.attachment_id, arr);
    }
    return map;
  }, [hazardDetections]);

  // 자동 스크롤 — 새 메시지/cue/citations 갱신 시 bottom으로.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, cueMessage, citations.length, talking]);

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-2 space-y-2"
      style={{ scrollBehavior: "smooth" }}
    >
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-pwc-ink-mute">
          <div className="text-center">
            {connecting ? (
              <>
                <div className="inline-block w-8 h-8 border-2 border-pwc-orange border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">연결 중...</p>
              </>
            ) : sessionActive ? (
              <p className="text-sm">대화가 곧 시작됩니다</p>
            ) : (
              <p className="text-sm">
                {currentMode === "EHS"
                  ? "EHS 지식 챗을 시작해주세요"
                  : "TBM 세션을 시작해주세요"}
              </p>
            )}
          </div>
        </div>
      ) : (
        messages.map((msg, i) => {
          const isAssistant = msg.role === "assistant";
          const isLastAssistant = isAssistant && i === lastAssistantIndex;
          const isWarning = isAssistant && msg.text.startsWith("[안전 경고]");
          // PR C — 메시지에 매칭되는 첨부/vision 결과 lookup.
          const msgAttachments: MediaAttachment[] = (msg.attachment_ids ?? [])
            .map((id) => attachmentById.get(id))
            .filter((a): a is MediaAttachment => !!a);
          // assistant 메시지의 attachment_ids에 hazard_detections가 있으면 카드 inline.
          const cardEntries: {
            attachment: MediaAttachment;
            detections: HazardDetection[];
          }[] = isAssistant
            ? msgAttachments
                .map((a) => ({
                  attachment: a,
                  detections: detectionsByAttachmentId.get(a.id) ?? [],
                }))
                .filter((entry) => entry.detections.length > 0 || true) // 빈 결과도 카드 표시 (특이 위험 미식별)
            : [];
          return (
            <div key={i} className="flex flex-col">
              <div
                className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`flex flex-col gap-1.5 max-w-[80%] ${
                    isAssistant ? "items-start" : "items-end"
                  }`}
                >
                  {/* PR C — 첨부 썸네일 (user 사진 메시지 / assistant 결과 메시지). */}
                  {msgAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {msgAttachments.map((a) => (
                        <AttachmentPreview key={a.id} attachment={a} />
                      ))}
                    </div>
                  )}
                  <div
                    className={`px-4 py-2 rounded-pwc-lg text-sm break-words leading-relaxed shadow-sm ${
                      isWarning
                        ? "bg-pwc-orange text-white border-l-4 border-pwc-orange-deep font-semibold"
                        : isAssistant
                          ? "bg-pwc-bg-card text-pwc-ink border border-pwc-border"
                          : "bg-pwc-orange-wash text-pwc-ink border border-pwc-orange/20"
                    }`}
                  >
                    {msg.text}
                  </div>
                  {/* Phase chat-PR3: 메시지 actions 버튼 inline. 음성 폴백
                       안내 메시지의 [다시 시도] / [채팅으로 계속] 버튼. */}
                  {isAssistant && msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {msg.actions.map((act) => (
                        <button
                          key={act.id}
                          type="button"
                          onClick={() => onMessageAction?.(i, act.id)}
                          className={`px-3 py-1.5 rounded-pwc text-xs font-semibold border transition-colors ${
                            act.id === "retry_voice"
                              ? "bg-pwc-orange text-white border-pwc-orange-deep hover:bg-pwc-orange-deep"
                              : "bg-pwc-bg-card text-pwc-ink-mute border-pwc-border hover:text-pwc-orange hover:bg-pwc-orange-wash"
                          }`}
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* PR C — assistant 메시지에 매칭되는 vision 결과 inline 카드. */}
              {/* PR E spacing: 메시지 bubble 아래 8px(mt-2), 카드 사이 4px(space-y-1) */}
              {isAssistant && cardEntries.length > 0 && (
                <div className="mt-2 ml-1 max-w-[80%] space-y-1">
                  {cardEntries.map((entry) => (
                    <HazardResultCard
                      key={`hr-${entry.attachment.id}`}
                      attachment={entry.attachment}
                      detections={entry.detections}
                      result={detectionsToResponse(
                        entry.detections,
                        entry.detections.length === 0
                          ? msg.text
                          : msg.text || "사진 분석을 완료했습니다.",
                      )}
                      onAddToStructured={
                        onAddDetectionToStructured
                          ? (detId) => onAddDetectionToStructured(detId)
                          : undefined
                      }
                      onUndoFromStructured={
                        onUndoDetectionFromStructured
                          ? (detId) => onUndoDetectionFromStructured(detId)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}

              {/* Cycle 3 Option C: 가장 최신 assistant 메시지 바로 아래에 누적 citations inline. */}
              {/* PR E spacing: 메시지 bubble 아래 8px(mt-2). */}
              {isLastAssistant && citations.length > 0 && (
                <div className="mt-2 ml-1 max-w-[80%]">
                  <InlineCitations citations={citations} onClear={onClearCitations} />
                </div>
              )}
            </div>
          );
        })
      )}

      {/* assistant typing indicator */}
      {talking === "assistant" && messages.length > 0 && (
        <div className="flex justify-start">
          <div className="px-4 py-2 rounded-pwc-lg bg-pwc-bg-card border border-pwc-border inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-pwc-orange animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-pwc-orange animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-pwc-orange animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      )}

      {/* Cycle 3: cueMessage는 chat 안 system 메시지(작은 글씨, 가운데, 회색) */}
      {cueMessage && (
        <div className="text-pwc-ink-mute text-xs italic text-center my-1.5 px-2">
          {cueMessage}
        </div>
      )}

      {/* Cycle 3: EHS 추천질문 — citations 없을 때만 chip row로 chat 안에 */}
      {/* PR D Q5: hover/focus pause + "↻ 다른 질문" 수동 회전 버튼. */}
      {showRecommendedChips &&
        currentMode === "EHS" &&
        citations.length === 0 &&
        recommendedQuestions.length > 0 && (
          <div
            className="pt-2"
            onPointerEnter={() => onRecommendedHoverChange?.(true)}
            onPointerLeave={() => onRecommendedHoverChange?.(false)}
            onFocusCapture={() => onRecommendedHoverChange?.(true)}
            onBlurCapture={(e) => {
              // 다음 포커스 대상이 같은 컨테이너 내부면 hover 유지.
              const next = e.relatedTarget as Node | null;
              if (next && e.currentTarget.contains(next)) return;
              onRecommendedHoverChange?.(false);
            }}
          >
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="text-[10px] uppercase tracking-wider text-pwc-ink-soft font-bold">
                추천 질문
              </div>
              {onRotateRecommended && (
                <button
                  type="button"
                  onClick={onRotateRecommended}
                  className="text-[10px] uppercase tracking-wider text-pwc-ink-soft hover:text-pwc-orange font-semibold transition px-1.5 py-0.5"
                  aria-label="다른 추천 질문 보기"
                  title="다른 질문 보기"
                >
                  ↻ 다른 질문
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {recommendedQuestions.map((q, idx) => (
                <button
                  key={`${q}-${idx}`}
                  type="button"
                  onClick={() => onClickRecommendedQuestion(q)}
                  disabled={idx === 0 && recommendedAnimatingOut}
                  className={`w-full text-left px-3 py-2 rounded-pwc bg-pwc-bg-card text-pwc-ink text-xs leading-relaxed border border-pwc-border hover:border-pwc-orange hover:bg-pwc-orange-wash transition-all ${
                    idx === 0 && recommendedAnimatingOut ? "opacity-40 scale-95" : ""
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

// PR C — HazardDetection[] -> HazardDetectionResponse 재구성.
// 영속 모델은 hazard_detections만 보관(visionAnalyze 응답 자체는 비영속) —
// 카드 표시 시 assistant 메시지 텍스트(=summary)와 detections 목록을 합쳐
// HazardDetectionResponse 형태로 복원.
function detectionsToResponse(
  detections: HazardDetection[],
  summary: string,
): HazardDetectionResponse {
  return {
    summary,
    hazards: detections.map((d) => ({
      hazard: d.hazard,
      domain_tag: d.domain_tag,
      confidence: d.confidence,
      bbox: d.bbox,
      rationale: d.rationale,
      suggested_mitigation: d.suggested_mitigation,
    })),
  };
}

// 인라인 citations — PR E (c6 §3.VI) 마이그레이션.
// 최신 1건 펼침 + "+N개 더" 토글은 그대로 유지. 각 citation 1건은 신규
// `<IncidentCaseCard>`로 표현 — 5종 카드 통일. 클릭 시 새 탭 open은 카드 내장.
function InlineCitations({
  citations,
  onClear,
}: {
  citations: CitationDisplay[];
  onClear: () => void;
}) {
  const [expandedAll, setExpandedAll] = useState(false);
  if (citations.length === 0) return null;
  const total = citations.length;
  const latest = citations[total - 1];
  const previous = citations.slice(0, total - 1);
  const hiddenCount = previous.length;
  const showPrevious = expandedAll && hiddenCount > 0;

  return (
    <div className="bg-pwc-bg border border-pwc-border rounded-pwc-lg shadow-pwc-card p-3 text-left">
      <div className="flex items-center gap-2 mb-2">
        <IconDoc size={14} />
        <span className="text-[10px] uppercase tracking-wider text-pwc-orange font-bold">
          관련 문서
        </span>
        {total > 1 && (
          <span className="text-[10px] text-pwc-ink-soft font-medium ml-1">{total}건</span>
        )}
        <button
          className="ml-auto text-pwc-ink-soft hover:text-pwc-orange transition-colors p-0.5"
          onClick={onClear}
          aria-label="Clear citations"
        >
          <IconClose size={12} />
        </button>
      </div>
      {latest.context && (
        <p className="text-pwc-ink-soft text-[11px] mb-2">{latest.context}</p>
      )}
      <div className="space-y-1.5">
        {latest.citations.map((c, i) => (
          <IncidentCaseCard
            key={`latest-${i}`}
            title={c.title}
            summary={c.summary}
            url={c.url}
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <div className="mt-2 pt-2 border-t border-pwc-border">
          <button
            type="button"
            className="text-[10px] text-pwc-ink-soft hover:text-pwc-orange font-medium uppercase tracking-wider transition-colors"
            onClick={() => setExpandedAll((v) => !v)}
            aria-expanded={expandedAll}
          >
            {expandedAll ? "이전 항목 접기" : `+${hiddenCount}개 더`}
          </button>
          {showPrevious && (
            <div className="mt-1.5 space-y-1.5">
              {previous
                .slice()
                .reverse()
                .map((entry, entryIdx) => (
                  <div key={`prev-${entry.timestamp}-${entryIdx}`}>
                    {entry.context && (
                      <p className="text-pwc-ink-soft text-[10px] mb-1 leading-snug">
                        {entry.context}
                      </p>
                    )}
                    <div className="space-y-1">
                      {entry.citations.map((c, i) => (
                        <IncidentCaseCard
                          key={i}
                          title={c.title}
                          summary={c.summary}
                          url={c.url}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
