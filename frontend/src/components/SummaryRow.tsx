interface SummaryRowProps {
  label: string;
  value?: string | string[];
}

export default function SummaryRow({ label, value }: SummaryRowProps) {
  const empty =
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0);

  return (
    <div className="py-3 border-b border-pwc-border last:border-b-0">
      <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-1.5">
        {label}
      </div>
      {empty ? (
        <div className="text-sm text-pwc-ink-mute italic">아직 비어 있음</div>
      ) : Array.isArray(value) ? (
        <ul className="flex flex-col gap-1">
          {value.map((v, i) => (
            <li key={i} className="text-sm text-pwc-ink leading-relaxed">
              • {v}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-pwc-ink whitespace-pre-wrap leading-relaxed">{value}</div>
      )}
    </div>
  );
}
