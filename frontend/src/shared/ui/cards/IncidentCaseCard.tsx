// IncidentCaseCard — PR E (c6 §3.VI). 유사 사고사례 카드.
//
// 기존 InlineCitations / CitationsPanel의 citation 카드 1건을 흡수. URL 있으면
// 클릭 시 새 탭 open. ChatList의 누적 citation 표시는 본 카드의 list로 교체.

import { IconDoc } from "../../../components/Icon";
import { InfoCardBase } from "./InfoCardBase";

interface IncidentCaseCardProps {
  title: string;
  summary: string;
  /** 외부 자료 URL — 클릭 시 새 탭. */
  url?: string;
  /** 발생일 / 출처 일자. meta 라인에 표시. */
  date?: string;
  /** 출처 라벨 (e.g. "안전보건공단"). meta 라인에 표시. */
  source?: string;
  className?: string;
}

export function IncidentCaseCard({
  title,
  summary,
  url,
  date,
  source,
  className,
}: IncidentCaseCardProps) {
  const metaParts: string[] = [];
  if (source) metaParts.push(source);
  if (date) metaParts.push(date);
  const meta = metaParts.length > 0 ? metaParts.join(" · ") : undefined;

  const handleOpen = url
    ? () => {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    : undefined;

  return (
    <InfoCardBase
      kind="incident"
      title={title}
      body={summary}
      meta={meta}
      icon={<IconDoc size={16} />}
      onClick={handleOpen}
      ariaLabel={url ? `${title} (새 탭에서 열기)` : title}
      className={className}
    />
  );
}
