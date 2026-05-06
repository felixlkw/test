// Progress — 단일 진행률 바.
interface ProgressProps {
  percent: number;
  /** 라벨 (PR 1에서는 미사용, 추후 ProgressStack에 표시) */
  label?: string;
}

export function Progress({ percent }: ProgressProps) {
  return (
    <div className="w-full h-1.5 bg-pwc-border overflow-hidden">
      <div
        className="h-full bg-pwc-orange transition-all duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
