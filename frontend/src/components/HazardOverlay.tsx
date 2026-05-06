// HazardOverlay — PR C (Phase 2.0 MVP, c5 §7.1 / §8.2).
//
// 이미지 위 SVG bbox + 라벨 overlay. PR C는 단순 시각화 — Phase 2에서
// 정교화(c5 Phase 2 항목). bbox 좌표는 normalized 0..1 (visionAnalyze가 보장).

import type { HazardDetection } from "../services/sessionModel";

interface HazardOverlayProps {
  /** 표시 대상 hazard 목록 — bbox가 있는 항목만 그려진다. */
  detections: HazardDetection[];
  /** 강조할 detection.id (펼쳐진 카드와 연동). 없으면 모두 동일 톤. */
  highlightId?: string;
}

export function HazardOverlay({ detections, highlightId }: HazardOverlayProps) {
  const visible = detections.filter((d) => Array.isArray(d.bbox));
  if (visible.length === 0) return null;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      {visible.map((d, i) => {
        const bbox = d.bbox!;
        const [x, y, w, h] = bbox;
        const isHi = highlightId && d.id === highlightId;
        return (
          <g key={d.id ?? i}>
            <rect
              x={x * 100}
              y={y * 100}
              width={w * 100}
              height={h * 100}
              fill="none"
              stroke={isHi ? "#E0301E" : "#FFB27A"}
              strokeWidth={isHi ? "0.5" : "0.3"}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x * 100 + 0.6}
              y={y * 100 + 2.4}
              fontSize="2"
              fill={isHi ? "#E0301E" : "#FFB27A"}
              vectorEffect="non-scaling-stroke"
            >
              {(i + 1).toString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
