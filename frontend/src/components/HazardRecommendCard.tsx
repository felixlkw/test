// HazardRecommendCard — PR A baseline·conditional + PR E 5종 카드 마이그레이션.
//
// PR E (c6 §3.VI): 기존 inline 마크업을 신규 `<HazardCard>` 통일 컴포넌트로
// 재구성. 외부 API(prop signature)는 PR B+ 그대로 유지 — PrepareScreen 호출부
// 변경 0. baseline은 baselineLocked + IconLock, conditional은 점선 border +
// "조건:" 헤더로 표시.
//
// PR B+ 보강(felix lock §6 Q1=A) 그대로 보존:
//   NEW-H2: source chip("카탈로그" / "AI 보강")은 HazardCard.source로 위임.
//   NEW-H3: conditional `if` DSL을 humanizeIfClause(language)로 변환.
//
// Phase 2.x PR-1 보강:
//   baseline 항목 안의 per-item scenarios/mitigations/ppe를 펼침/접힘 영역으로
//   미리보기 노출. 항목 카드 footer 영역(extra)에 "관련 시나리오 N건 / 대응 M건
//   / PPE K개" 토글 노출. ts strict, `any` 신규 0건. PwC 토큰만.

import { useState } from "react";
import type {
  BaselineHazardItem,
  ConditionalHazardItem,
} from "../services/recommendHazards";
import { humanizeIfClause } from "../services/recommendHazards";
import type { SessionLanguage } from "../services/sessionModel";
import { HazardCard } from "../shared/ui/cards";

interface HazardRecommendCardProps {
  baseline: BaselineHazardItem[];
  conditional: ConditionalHazardItem[];
  /** PR B+ NEW-H3: conditional `if` DSL 변환 언어. 미지정 시 한국어. */
  language?: SessionLanguage;
}

interface BaselinePerItemPreviewProps {
  baselineId: string;
  scenarios?: { id: string; content: string }[];
  mitigations?: { id: string; content: string }[];
  ppe?: { id: string; content: string }[];
}

/** Phase 2.x PR-1 — baseline 카드 footer 안에 노출되는 per-item 미리보기.
 *  접힘 default. 펼침 시 시나리오/대응/PPE를 짧은 불릿 3개로 노출.
 *  비영속 view state(invariant #10) — useState만, IndexedDB 미저장.
 */
function BaselinePerItemPreview({
  baselineId,
  scenarios,
  mitigations,
  ppe,
}: BaselinePerItemPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const sCount = scenarios?.length ?? 0;
  const mCount = mitigations?.length ?? 0;
  const pCount = ppe?.length ?? 0;
  const total = sCount + mCount + pCount;
  if (total === 0) return null;

  const summary = [
    sCount > 0 ? `시나리오 ${sCount}` : null,
    mCount > 0 ? `대응 ${mCount}` : null,
    pCount > 0 ? `PPE ${pCount}` : null,
  ]
    .filter((p): p is string => !!p)
    .join(" · ");

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`hrc-baseline-detail-${baselineId}`}
        className="text-[10px] uppercase tracking-wider text-pwc-orange hover:text-pwc-orange-deep font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-pwc-orange rounded-pwc"
      >
        {expanded ? `▾ ${summary} 접기` : `▸ ${summary} 펼침`}
      </button>
      {expanded && (
        <div
          id={`hrc-baseline-detail-${baselineId}`}
          className="mt-1.5 space-y-1.5 border-l-2 border-pwc-orange/30 pl-2"
        >
          {sCount > 0 && (
            <div>
              <div className="text-[10px] font-bold text-pwc-ink-soft uppercase tracking-wider">
                관련 시나리오
              </div>
              <ul className="text-[11px] text-pwc-ink leading-snug list-disc pl-4">
                {(scenarios ?? []).map((s) => (
                  <li key={s.id}>{s.content}</li>
                ))}
              </ul>
            </div>
          )}
          {mCount > 0 && (
            <div>
              <div className="text-[10px] font-bold text-pwc-ink-soft uppercase tracking-wider">
                대응 조치
              </div>
              <ul className="text-[11px] text-pwc-ink leading-snug list-disc pl-4">
                {(mitigations ?? []).map((m) => (
                  <li key={m.id}>{m.content}</li>
                ))}
              </ul>
            </div>
          )}
          {pCount > 0 && (
            <div>
              <div className="text-[10px] font-bold text-pwc-ink-soft uppercase tracking-wider">
                권장 PPE
              </div>
              <ul className="text-[11px] text-pwc-ink leading-snug list-disc pl-4">
                {(ppe ?? []).map((p) => (
                  <li key={p.id}>{p.content}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HazardRecommendCard({
  baseline,
  conditional,
  language = "korean",
}: HazardRecommendCardProps) {
  if (!baseline.length && !conditional.length) {
    return (
      <div className="text-sm text-pwc-ink-mute py-3">
        등록된 위험 추천 항목이 없습니다.
      </div>
    );
  }
  return (
    <div className="bg-white border border-pwc-border rounded-pwc-lg shadow-pwc-card overflow-hidden">
      {baseline.length > 0 && (
        <section aria-labelledby="hrc-baseline" className="p-4">
          <header className="flex items-center justify-between mb-3">
            <h3
              id="hrc-baseline"
              className="text-[13px] font-bold uppercase tracking-wider text-pwc-orange"
            >
              필수 기본 점검
            </h3>
            <span className="text-[11px] text-pwc-ink-mute">
              모두 체크리스트에 자동 포함됩니다
            </span>
          </header>
          <ul className="space-y-2">
            {baseline.map((b) => {
              // baseline은 자물쇠 lock + 추가/되돌리기 버튼 비노출.
              const metaParts: string[] = [b.id];
              if (b.regulation) metaParts.push(b.regulation);
              if (b.evidence_required) metaParts.push(b.evidence_required);
              return (
                <li key={b.id}>
                  <HazardCard
                    hazard={b.content}
                    source={b.source}
                    baselineLocked
                    meta={metaParts.join(" · ")}
                    extra={
                      <BaselinePerItemPreview
                        baselineId={b.id}
                        scenarios={b.scenarios}
                        mitigations={b.mitigations}
                        ppe={b.ppe}
                      />
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {conditional.length > 0 && (
        <section
          aria-labelledby="hrc-conditional"
          className="border-t border-pwc-border p-4"
        >
          <header className="mb-3">
            <h3
              id="hrc-conditional"
              className="text-[13px] font-bold uppercase tracking-wider text-pwc-ink-soft"
            >
              조건부 점검
            </h3>
            <p className="text-[11px] text-pwc-ink-mute mt-0.5">
              조건이 맞을 때만 체크리스트에 추가됩니다.
            </p>
          </header>
          <ul className="space-y-2">
            {conditional.map((c) => {
              const ifLabel = humanizeIfClause(c.if, language);
              const metaParts: string[] = [`조건: ${ifLabel}`, c.id];
              if (c.regulation) metaParts.push(c.regulation);
              return (
                <li key={c.id}>
                  <HazardCard
                    hazard={c.content}
                    source={c.source}
                    meta={metaParts.join(" · ")}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
